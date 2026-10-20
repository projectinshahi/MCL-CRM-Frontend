"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, use, useCallback, useLayoutEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useToast } from "@/components/feedback";
import { FilterMenu, PageHeader, Popover, PrimaryButton, SearchBox, ToolButton } from "@/components/ui";
import { CreateLeadModal, PRIORITIES, useLookups } from "@/components/leads/LeadModals";
import { SubtitleSkeleton } from "@/components/skeletons";
import { cap, useApi, useDebounced, type List } from "@/lib/api";

type Filter = { sourceId: string; priority: string };
type Ctx = {
  search: string; // what the box shows
  q: string; // what the API is asked: the search once typing pauses
  setSearch: (v: string) => void;
  filter: Filter;
  setFilter: Dispatch<SetStateAction<Filter>>;
  version: number; // bumped after a create so the table / pipeline refetch
  refresh: () => void;
};

const LeadsCtx = createContext<Ctx | null>(null);

// Shared by Table and Pipeline views; Search + Filter are sent to the API.
export function useLeads() {
  const ctx = use(LeadsCtx);
  if (!ctx) throw new Error("useLeads must be used inside <LeadsView>");
  return { ...ctx, query: { q: ctx.q, sourceId: ctx.filter.sourceId, priority: ctx.filter.priority } };
}

/* ---------- Filter dropdown (Figma 1:7751 collapsed / 1:7770 Sources expanded): shared FilterMenu ---------- */
function LeadFilterMenu({ onPicked }: { onPicked: () => void }) {
  const { filter, setFilter } = useLeads();
  const { sources } = useLookups();
  return (
    <FilterMenu
      groups={[
        { key: "sourceId", label: "Sources", options: sources.map((s) => ({ value: s.id, label: s.name })) },
        { key: "priority", label: "Priority", options: PRIORITIES.map((p) => ({ value: p, label: cap(p) })) },
      ]}
      value={filter}
      onPick={(key, value) => {
        setFilter((f) => ({ ...f, [key]: value }));
        onPicked();
      }}
    />
  );
}

// Search / Report / Filter group: inside the table card (Table view), in the toggle row (Pipeline view).
export function LeadTools({ className = "" }: { className?: string }) {
  const { search, setSearch } = useLeads();
  const toast = useToast();
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <div className={`flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto ${className}`}>
      <SearchBox value={search} onChange={setSearch} />
      {/* Report: export scope not decided yet (report O1 / Q23) */}
      <ToolButton label="Report" icon="download" onClick={() => toast.info("Lead reports aren't available yet", "Export will be added once its contents are agreed.")} />
      <ToolButton label="Filter" icon="filter" btnRef={btn} onClick={() => setOpen(true)} />
      {/* Figma: MANUAL overlay at (-38.2, 54) from the Filter button, 25% backdrop */}
      <Popover anchor={btn} open={open} onClose={close} dx={-38.2} dy={54}>
        <LeadFilterMenu onPicked={close} />
      </Popover>
    </div>
  );
}

/* ---------- Table View / Pipeline View segmented control (1:6139 / 1:6998) ---------- */
// Fixed widths = Figma (text + 2×16 padding) so the active pill can slide between them.
const VIEWS = [
  { href: "/leads", label: "Table View", w: 120 },
  { href: "/leads/pipeline", label: "Pipeline View", w: 143 },
];

function ViewToggle({ pipeline }: { pipeline: boolean }) {
  return (
    <nav aria-label="Leads view" className="relative flex shrink-0 gap-[7px] rounded-[22px] border border-stroke2 bg-primary p-[10px]">
      {/* Smart Animate 300ms ease-out (Figma 1:6143 / 1:6999) */}
      <span
        aria-hidden
        className="absolute top-[10px] left-[10px] h-10 rounded-[12px] bg-button transition-[translate,width]"
        style={{ width: VIEWS[+pipeline].w, translate: pipeline ? `${VIEWS[0].w + 7}px` : "0" }}
      />
      {VIEWS.map((v, i) => {
        const active = i === +pipeline;
        return (
          <Link
            key={v.href}
            href={v.href}
            aria-current={active ? "page" : undefined}
            style={{ width: v.w }}
            className={`relative flex h-10 items-center justify-center text-[16px] font-medium whitespace-nowrap transition-colors ${active ? "text-white" : "text-black"}`}
          >
            {v.label}
          </Link>
        );
      })}
    </nav>
  );
}

/* ---------- Shared layout for /leads (Table) and /leads/pipeline ---------- */
export function LeadsView({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const pipeline = pathname.endsWith("/pipeline");
  const [search, setSearch] = useState("");
  const q = useDebounced(search);
  const [filter, setFilter] = useState<Filter>({ sourceId: "", priority: "" });
  const [version, setVersion] = useState(0);
  const [creating, setCreating] = useState(false);
  const closeCreate = useCallback(() => setCreating(false), []);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const all = useApi<List<unknown>>("/leads", { pageSize: 1 }, version);
  const total = all.data?.total;
  // Switching Table ↔ Pipeline replays the dissolve on the same element. A key={pathname} remount did that before,
  // but it also threw both kept views away (Next keeps visited pages mounted): the table lost its page, and every
  // switch, even back from a lead, showed skeletons and fetched the leads or the whole board again.
  const view = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    for (const a of view.current?.getAnimations() ?? []) {
      a.cancel();
      a.play();
    }
  }, [pipeline]);

  return (
    <LeadsCtx value={{ search, q, setSearch, filter, setFilter, version, refresh }}>
      <div className="flex flex-col gap-[18px] p-4 sm:p-6">
        <PageHeader
          title="Leads Management"
          subtitle={total === undefined ? !all.error && <SubtitleSkeleton /> : `${total} Total Leads`}
          action={<PrimaryButton onClick={() => setCreating(true)}>Add Lead</PrimaryButton>}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ViewToggle pipeline={pipeline} />
          {pipeline && (
            <div className="w-full animate-dissolve sm:w-auto">
              {/* Pipeline frame (1:7005): Search / Report / Filter sit on the page, filled with primary */}
              <LeadTools className="*:bg-primary!" />
            </div>
          )}
        </div>
        <div ref={view} className="min-w-0 animate-dissolve">
          {children}
        </div>
      </div>
      <CreateLeadModal
        open={creating}
        onClose={closeCreate}
        onCreate={() => {
          refresh();
          closeCreate();
        }}
      />
    </LeadsCtx>
  );
}
