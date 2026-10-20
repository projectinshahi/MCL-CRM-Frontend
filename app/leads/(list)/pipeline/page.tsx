"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject, type TouchEvent } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDndContext,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Active,
  type Announcements,
  type CollisionDetection,
  type DraggableAttributes,
  type KeyboardCoordinateGetter,
  type Over,
} from "@dnd-kit/core";
import { Icon } from "@/components/Icon";
import { errorDetail, useRemove, useToast } from "@/components/feedback";
import { useMe } from "@/components/Shell";
import { PipelineSkeleton } from "@/components/skeletons";
import { Badge, IconButton, LoadFailed, Popover } from "@/components/ui";
import { ConvertLeadModal } from "@/components/leads/ConvertLead";
import { EditLeadModal, leadRemoval, type Lead, type Status } from "@/components/leads/LeadModals";
import { useLeads } from "@/components/leads/LeadsView";
import { api, ApiError, cap, day, inr, useApi } from "@/lib/api";
import { place, reconcile, type Column } from "@/lib/pipeline";

const action = "flex items-center rounded-[16px] border-[0.5px] border-stroke2 bg-primary px-2 py-[6px] text-[10px] font-medium tracking-[-0.4px] text-black";
const label = "w-[39px] text-center";
const cardBox = "flex flex-col rounded-[16px] border border-stroke2 bg-[#9ce8fb] p-5 dark:bg-[#123847]";
const titleCls = "min-w-0 text-[16px] font-medium tracking-[-0.64px] break-words text-black";

type Pipeline = { columns: (Column<Lead> & { status: Status })[] };

/* ---------- Drag and drop (dnd-kit): mouse, touch and keyboard ---------- */
// A card can be pressed and dragged anywhere except on its links and buttons, which keep their own clicks.
// The grip is the exception: it is there to be dragged (and clicked for the stage list).
const draggableFrom = (target: EventTarget | null) => !(target as HTMLElement).closest("a, button:not([data-grip])");

class CardMouseSensor extends MouseSensor {
  static activators = [{ eventName: "onMouseDown" as const, handler: ({ nativeEvent: e }: MouseEvent) => e.button === 0 && draggableFrom(e.target) }];
}
class CardTouchSensor extends TouchSensor {
  static activators = [{ eventName: "onTouchStart" as const, handler: ({ nativeEvent: e }: TouchEvent) => e.touches.length === 1 && draggableFrom(e.target) }];
}

// Space lifts the card (Enter on the grip opens the stage list instead); Space, Enter or Tab drops it; Escape cancels.
const KEYS = { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter", "Tab"] };

/** Left / right arrows jump a lifted card to the neighbouring stage (dnd-kit's default nudges it 25px). */
const byStage: KeyboardCoordinateGetter = (event, { context: { collisionRect, droppableRects, droppableContainers } }) => {
  if (!event.code.startsWith("Arrow")) return;
  event.preventDefault(); // the page must not scroll under a lifted card
  if (!collisionRect || (event.code !== "ArrowLeft" && event.code !== "ArrowRight")) return;
  const mid = collisionRect.left + collisionRect.width / 2;
  const lanes = droppableContainers
    .getEnabled()
    .map((c) => droppableRects.get(c.id))
    .filter((r) => r !== undefined)
    .sort((a, b) => a.left - b.left);
  const next = event.code === "ArrowRight" ? lanes.find((r) => r.left > mid) : lanes.findLast((r) => r.right < mid);
  if (!next) return;
  return { x: next.left + (next.width - collisionRect.width) / 2, y: Math.max(next.top, Math.min(collisionRect.top, next.bottom - collisionRect.height)) };
};

// Pointer: the stage under it, or, below a short column, the stage whose lane it is in. Keyboard: the stage the
// lifted card overlaps.
const collision: CollisionDetection = (args) => {
  const p = args.pointerCoordinates;
  if (!p) return rectIntersection(args);
  const hit = pointerWithin(args);
  if (hit.length) return hit;
  const lane = args.droppableContainers.find((c) => {
    const r = args.droppableRects.get(c.id);
    return r && p.x >= r.left && p.x <= r.right && p.y >= r.top;
  });
  return lane ? [{ id: lane.id }] : [];
};

const leadOf = (a: Active) => a.data.current!.lead as Lead;
const stageOf = (o: Over | null) => o?.data.current?.status as Status | undefined;

// Read out by screen readers (titles and stage names only; ids never leave the page).
const announcements: Announcements = {
  onDragStart: ({ active }) => `Picked up ${leadOf(active).title} from ${leadOf(active).status.name}.`,
  onDragOver: ({ active, over }) => (stageOf(over) ? `${leadOf(active).title} is over ${stageOf(over)!.name}.` : `${leadOf(active).title} is not over a stage.`),
  onDragEnd: ({ active, over }) => {
    const to = stageOf(over);
    return to && to.id !== leadOf(active).status.id ? `${leadOf(active).title} moved to ${to.name}.` : `${leadOf(active).title} was not moved.`;
  },
  onDragCancel: ({ active }) => `Move cancelled. ${leadOf(active).title} stays in ${leadOf(active).status.name}.`,
};
const screenReaderInstructions = {
  draggable:
    "To move this lead to another stage, press Space to pick it up, use the left and right arrow keys to choose a stage, then press Space to drop it, or Escape to cancel. Or press Enter to choose the stage from a list.",
};

/** Why a move failed, and where the card is now. */
function moveFailure(err: unknown, from: Status) {
  if (err instanceof ApiError && err.code === "STALE_VERSION") return "Someone else changed this lead in the meantime, so the move wasn't saved. The board now shows the latest version; please try again.";
  if (err instanceof ApiError && err.status === 404) return "It was deleted or is no longer assigned to you, so it has been taken off the board.";
  return `${errorDetail(err)} The card is back in ${from.name}.`;
}

// A card that changes column is a new element; this hands keyboard focus to its grip there.
let regainFocus: string | null = null;
const keepFocus = (id: string) => {
  if (document.activeElement?.closest<HTMLElement>("[data-lead]")?.dataset.lead === id) regainFocus = id;
};

// Leads- Pipeline (Figma 1:6990). Columns are 306px; the board scrolls sideways like the frame crops it.
export default function LeadsPipelinePage() {
  const { query, version, refresh } = useLeads();
  const board = useApi<Pipeline>("/leads/pipeline", query, version);
  const { mutate, reload } = board;
  const [editing, setEditing] = useState<Lead | null>(null);
  const [converting, setConverting] = useState<Lead | null>(null);
  const canConvert = useMe()?.permissions.includes("customers") ?? false; // conversion creates a customer
  // Per lead whose move is being saved: the server's last copy (its version, and where an undo goes) and the stage
  // the user chose last. A card moved again meanwhile goes there at once; that stage alone is sent next.
  const saves = useRef(new Map<string, { server: Lead; want: Status }>());
  // The server's copy after each move saved here. A board read (a search, another lead's edit, coming back to the
  // page) can leave before a move is saved and arrive after it: reconcile() keeps the move instead of showing the
  // card back in its old column. ponytail: never pruned; one entry per lead moved while the page is open.
  const savedCopies = useRef(new Map<string, Lead>());
  useEffect(() => {
    const data = board.data;
    if (!data) return;
    const moving = () => [...saves.current.values()].map((s) => ({ ...s.server, status: s.want }));
    if (reconcile(data, savedCopies.current.values(), moving()) !== data) mutate((b) => reconcile(b, savedCopies.current.values(), moving()));
  }, [board.data, mutate]);
  const toast = useToast();
  const { remove, removing } = useRemove(refresh);
  // Stable, so a move re-renders only the card that moved (CardContents is memoised), not every card on the board.
  const latestRemove = useRef(remove);
  useEffect(() => {
    latestRemove.current = remove;
  });
  const onRemove = useCallback((c: Lead) => latestRemove.current(c.id, leadRemoval(c)), []);
  const dndId = useId();
  const sensors = useSensors(
    useSensor(CardMouseSensor, { activationConstraint: { distance: 6 } }), // a click without movement still opens the lead
    useSensor(CardTouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }), // press and hold to drag; a swipe scrolls
    useSensor(KeyboardSensor, { coordinateGetter: byStage, keyboardCodes: KEYS }),
  );

  // Shown in the new stage at once, with nothing to wait for; the save runs behind it. The server's answer then
  // replaces the card with its copy (same place, new version) or, on failure, puts it back where the server has it.
  const move = useCallback(
    (lead: Lead, to: Status) => {
      if (lead.status.id === to.id) return;
      keepFocus(lead.id);
      mutate((b) => place(b, { ...lead, status: to }));
      const running = saves.current.get(lead.id);
      if (running) return void (running.want = to); // sent when the running save answers
      const save = { server: lead, want: to };
      saves.current.set(lead.id, save);
      void (async () => {
        try {
          // One request per lead at a time, each with the version the previous one returned (no false conflicts).
          while (save.server.status.id !== save.want.id)
            save.server = await api<Lead>(`/leads/${lead.id}`, { method: "PATCH", body: { statusId: save.want.id, version: save.server.version } });
          savedCopies.current.set(lead.id, save.server);
          mutate((b) => place(b, save.server));
        } catch (err) {
          keepFocus(lead.id);
          mutate((b) => place(b, save.server));
          toast.error(`Couldn't move ${lead.title}`, moveFailure(err, save.server.status));
          // Back in step with the server. The lead gone (404) or its new stage gone (422): the board itself changed.
          // Otherwise this lead only (the rest of the board, and moves in progress, stay): it may have changed, or
          // the move may have landed before the connection dropped.
          const gone = (e: unknown) => e instanceof ApiError && (e.status === 404 || e.status === 422);
          if (gone(err)) reload();
          else api<Lead>(`/leads/${lead.id}`).then((fresh) => mutate((b) => place(b, fresh)), (e) => gone(e) && reload());
        } finally {
          saves.current.delete(lead.id);
        }
      })();
    },
    [mutate, reload, toast],
  );

  const stages = board.data?.columns.map((c) => c.status) ?? [];

  return (
    <>
      <p className="mb-3 text-[12px] font-medium tracking-[-0.48px] text-nav opacity-70">
        Drag a card to another stage to move it, or use its grip <Icon name="drag" size={12} className="align-[-1px]" /> to pick a stage from a list.
      </p>
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={collision}
        accessibility={{ announcements, screenReaderInstructions }}
        onDragEnd={({ active, over }) => {
          const to = stageOf(over);
          if (to) void move(leadOf(active), to);
        }}
      >
        <div className="overflow-x-auto [scrollbar-width:thin]">
          {/* Columns share the board's height, so a stage's drop highlight is visible beside any card being dragged. */}
          {!board.data && !board.error && <PipelineSkeleton />}
          {!board.data && board.error && <LoadFailed what="pipeline" onRetry={reload} />}
          <div className="flex w-max items-stretch gap-3">
            {board.data?.columns.map((column) => (
              <StageColumn key={column.status.id} column={column}>
                {column.items.map((c) => (
                  <Card
                    key={c.id}
                    lead={c}
                    stages={stages}
                    removing={removing === c.id}
                    onMove={move}
                    onEdit={setEditing}
                    onRemove={onRemove}
                    canConvert={canConvert}
                    onConvert={setConverting}
                  />
                ))}
              </StageColumn>
            ))}
          </div>
        </div>
        {/* No drop animation: the card is already in its new place when the overlay goes (and nothing moves for reduced motion). */}
        <DragOverlay dropAnimation={null}>
          <LiftedCard />
        </DragOverlay>
      </DndContext>

      <ConvertLeadModal
        lead={converting}
        onClose={() => setConverting(null)}
        onConverted={(r) => {
          setConverting(null);
          mutate((b) => place(b, r.lead)); // into its new stage, now linked to its customer
        }}
      />
      <EditLeadModal
        lead={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          refresh();
        }}
      />
    </>
  );
}

// Lifting a card re-renders the columns and each card's thin drag wrapper (dnd-kit context), not the page or the
// cards' contents (memo): that halved the lift's main-thread time (119 → 60 ms on a 4x slowed CPU, 20 cards).
function StageColumn({ column: { status, count, totalValue, items }, children }: { column: Pipeline["columns"][number]; children: ReactNode }) {
  const { setNodeRef, isOver, active } = useDroppable({ id: status.id, data: { status } });
  const target = !!active && leadOf(active).status.id !== status.id; // somewhere the lifted card can go
  return (
    <section
      ref={setNodeRef}
      className={`flex w-[306px] shrink-0 flex-col gap-[19px] rounded-[16px] border border-[#6e85e5] p-4 outline-offset-2 transition-[background-color,outline-color] ${
        target ? (isOver ? "bg-bg5 outline-2 outline-focus" : "bg-primary outline-2 outline-[#6e85e5]/40 outline-dashed") : "bg-primary"
      }`}
    >
      <header className="flex flex-col gap-2 border-b border-stroke2 pb-3">
        <div className="flex w-[266px] items-center justify-between">
          <h2 className="flex items-center gap-3 text-[16px] font-medium tracking-[-0.64px] text-black">
            <span className="size-[10px] rounded-full bg-button" />
            {status.name}
          </h2>
          <span className="flex h-5 min-w-5 items-center justify-center rounded-[10px] bg-stroke px-1 text-[10px] leading-none font-medium tracking-[-0.4px] text-black dark:text-bg5">
            {count}
          </span>
        </div>
        <p className="text-[12px] font-medium tracking-[-0.48px] text-nav opacity-70">{inr(totalValue)}</p>
      </header>

      <div className="flex flex-col gap-3">
        {children}
        {!items.length && (
          <p className={`rounded-[16px] border border-dashed px-4 py-6 text-center text-[14px] text-nav ${target ? "border-[#6e85e5]" : "border-stroke2 opacity-70"}`}>
            {target ? "Drop here to move the lead to this stage" : "No leads in this stage"}
          </p>
        )}
        {count > items.length && items.length > 0 && <p className="text-center text-[12px] text-nav opacity-70">Newest {items.length} of {count} shown</p>}
      </div>
    </section>
  );
}

function CardDetails({ lead: c }: { lead: Lead }) {
  return (
    <div className="flex flex-col gap-[18px] text-[16px] text-black">
      <Badge label={cap(c.priority)} width={76} />
      <p className="font-medium tracking-[-0.64px]">{inr(c.expectedValue)}</p>
      <div className="flex items-center gap-[43px]">
        <p className="w-[100px] tracking-[-0.64px]">{c.source?.name ?? "------"}</p>
        <p className="w-20">{day(c.createdAt)}</p>
      </div>
    </div>
  );
}

const gripCls = "flex size-9 shrink-0 items-center justify-center rounded-[12px] border border-stroke2 bg-bg5";

type CardProps = {
  lead: Lead;
  stages: Status[];
  removing: boolean;
  onMove: (lead: Lead, to: Status) => void;
  onEdit: (lead: Lead) => void;
  onRemove: (lead: Lead) => void;
  canConvert: boolean;
  onConvert: (lead: Lead) => void;
};

function Card(props: CardProps) {
  const { stages, onMove, ...rest } = props; // the stage list is new on every board change; only the menu needs it
  const c = props.lead;
  const router = useRouter();
  const { setNodeRef, setActivatorNodeRef, listeners, attributes, isDragging } = useDraggable({ id: c.id, data: { lead: c } });
  const grip = useRef<HTMLButtonElement | null>(null);
  const [menu, setMenu] = useState(false);
  const closeMenu = useCallback(() => {
    setMenu(false);
    grip.current?.focus();
  }, []);

  // Card ON_CLICK → the lead's detail page (clicks on the card's own buttons/links are theirs; a drag is not a click).
  const open = (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest("button, a")) router.push(`/leads/${c.id}`);
  };

  return (
    <>
      {/* Card set 1:7329: Variant2 (rest) → Default (hover) via Smart Animate 300ms ease-out */}
      <article
        ref={setNodeRef}
        {...listeners}
        data-lead={c.id}
        onClick={open}
        className={`group ${cardBox} cursor-pointer touch-manipulation select-none [-webkit-touch-callout:none] ${isDragging ? "opacity-40" : ""}`}
      >
        <CardContents {...rest} attributes={attributes} setGrip={setActivatorNodeRef} gripRef={grip} menu={menu} openMenu={setMenu} />
      </article>
      {/* Outside the card: React events bubble out of portals, and a press in the menu must not start a drag. */}
      <MoveMenu
        anchor={grip}
        open={menu}
        lead={c}
        stages={stages}
        onClose={closeMenu}
        onPick={(s) => {
          closeMenu();
          onMove(c, s);
        }}
      />
    </>
  );
}

const CardContents = memo(function CardContents({ lead: c, removing, onEdit, onRemove, canConvert, onConvert, attributes, setGrip, gripRef, menu, openMenu }: Omit<CardProps, "stages" | "onMove"> & {
  attributes: DraggableAttributes;
  setGrip: (el: HTMLElement | null) => void;
  gripRef: RefObject<HTMLButtonElement | null>;
  menu: boolean;
  openMenu: (open: boolean) => void;
}) {
  const attachGrip = useCallback(
    (el: HTMLButtonElement | null) => {
      setGrip(el);
      gripRef.current = el;
      if (el && regainFocus === c.id) {
        regainFocus = null;
        el.focus();
      }
    },
    [setGrip, gripRef, c.id],
  );

  return (
    <>
      <div className="flex flex-col gap-[22px]">
        <div className="flex items-center justify-between gap-2">
          <h3 className={titleCls}>{c.title}</h3>
          <div className="flex shrink-0 items-center gap-1">
            <button
              suppressHydrationWarning
              type="button"
              data-grip
              ref={attachGrip}
              {...attributes}
              aria-label={`Move ${c.title}`}
              aria-haspopup="menu"
              aria-expanded={menu}
              title="Drag to another stage, or click to choose one"
              onClick={() => openMenu(true)}
              className={`${gripCls} cursor-grab transition-colors hover:bg-[rgb(71_215_251/0.2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus`}
            >
              <Icon name="drag" size={18} className="text-nav" />
            </button>
            <IconButton icon="delete" label="Delete lead" onClick={() => onRemove(c)} disabled={removing} />
          </div>
        </div>
        <CardDetails lead={c} />
      </div>
      <div className="grid grid-rows-[0fr] opacity-0 transition-[grid-template-rows,opacity] group-focus-within:grid-rows-[1fr] group-focus-within:opacity-100 group-hover:grid-rows-[1fr] group-hover:opacity-100">
        <div className="overflow-hidden">
          <div className="mt-[22px] flex items-center justify-between border-t border-stroke pt-3">
            <Link href={`/leads/${c.id}`} className={action}>
              <Icon name="eye" size={18} className="text-nav" />
              <span className={label}>View</span>
            </Link>
            <button suppressHydrationWarning type="button" onClick={() => onEdit(c)} className={`${action} cursor-pointer`}>
              <Icon name="edit" size={18} className="text-nav" />
              <span className={label}>Edit</span>
            </button>
            {/* Win: converts the lead into a customer (Leads and Customers access); a converted lead links to it instead */}
            {c.customer && !c.customer.deleted && canConvert ? (
              <Link href={`/customers/${c.customer.id}`} className={action}>
                <Icon name="converted" size={18} className="text-nav" />
                <span className="min-w-[39px] px-[2px] text-center">Customer</span>
              </Link>
            ) : (
              <button
                suppressHydrationWarning
                type="button"
                disabled={!canConvert || !!c.customer}
                title={c.customer ? `Its customer is ${c.customer.code}` : canConvert ? "Convert to a customer" : "Converting needs access to Customers"}
                onClick={() => onConvert(c)}
                className={`${action} cursor-pointer disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <Icon name="arrow-right" size={18} className="text-nav" />
                <span className={label}>Win</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
});

/** The card under the pointer (or keys) while it is being moved: a picture only, nothing in it can be pressed. */
function LiftedCard() {
  const { active } = useDndContext();
  if (!active) return null;
  const c = leadOf(active);
  return (
    <div aria-hidden className={`${cardBox} cursor-grabbing gap-[22px] shadow-[0_16px_32px_rgb(0_0_0/0.18)]`}>
      <div className="flex items-center justify-between gap-2">
        <p className={titleCls}>{c.title}</p>
        <span className={gripCls}>
          <Icon name="drag" size={18} className="text-nav" />
        </span>
      </div>
      <CardDetails lead={c} />
    </div>
  );
}

/** The non-drag way to move a lead: the grip's list of stages (Enter or click). Arrow keys move through it. */
function MoveMenu({ anchor, open, lead, stages, onClose, onPick }: {
  anchor: RefObject<HTMLButtonElement | null>;
  open: boolean;
  lead: Lead;
  stages: Status[];
  onClose: () => void;
  onPick: (to: Status) => void;
}) {
  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Tab") return onClose();
    const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = ({ ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: items.length - 1 } as Record<string, number>)[e.key];
    if (next === undefined) return;
    e.preventDefault();
    items[(next + items.length) % items.length]?.focus();
  };
  const first = stages.find((s) => s.id !== lead.status.id)?.id;
  return (
    <Popover anchor={anchor} open={open} onClose={onClose} dx={-144} dy={44} backdrop={false}>
      <div role="menu" aria-label={`Move ${lead.title} to`} onKeyDown={keys} className="flex w-[180px] flex-col overflow-hidden rounded-[9px] border border-stroke2 bg-primary py-1 shadow-[0_8px_24px_rgb(0_0_0/0.12)]">
        <p aria-hidden className="px-4 pt-2 pb-1 text-[12px] font-medium text-nav opacity-70">
          Move to stage
        </p>
        {stages.map((s) => {
          const here = s.id === lead.status.id;
          return (
            <button
              suppressHydrationWarning
              key={s.id}
              type="button"
              role="menuitem"
              autoFocus={s.id === first}
              disabled={here}
              onClick={() => onPick(s)}
              className="flex h-10 w-full cursor-pointer items-center justify-between px-4 text-left text-[16px] tracking-[-0.32px] text-nav hover:bg-bg5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus disabled:cursor-default disabled:text-selected disabled:hover:bg-transparent"
            >
              {s.name}
              {here && <span className="text-[12px]">Current</span>}
            </button>
          );
        })}
      </div>
    </Popover>
  );
}
