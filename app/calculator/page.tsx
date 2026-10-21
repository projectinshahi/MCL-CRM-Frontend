"use client";

import { useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/feedback";
import { Modal, ModalActions, PageHeader, Popover, SelectField, ToolButton } from "@/components/ui";
import {
  BREAKDOWN_HEAD, BREAKDOWN_ROWS, BREAKDOWN_TOTAL, COUNTRIES, DOC_TYPES, RATE_CHART_REF, RATE_HEAD, RATE_ROWS,
  RATE_TOTAL, RECENT_CALCS, RECENT_HEAD, type Calc, type DocType,
} from "@/lib/mock/calculator";

const MAX_KG = 10; // "Rate Calculator Supports Shipments Up To 10 kg"
const FSC_NOTE = "Please Verify The Latest Fuel Surcharge (FSC) With The International Department.";

/* ---------- Table: Figma rows are flex/justify-between with fixed column widths ---------- */
// w = Figma width; min = narrowest the column may shrink to (its text + breathing room) before the table scrolls inside its card.
type Col = { w: number; min: number; center?: boolean };
const HEAD = "items-start py-3 text-[13px] font-semibold *:opacity-80";
const BODY = "items-center py-2.5 text-[14px]";
const TOTAL = "items-center py-3 text-[14px] font-semibold uppercase";

function Row({ cols, cells, className }: { cols: Col[]; cells: ReactNode[]; className: string }) {
  return (
    <div className={`flex justify-between border-b border-stroke2 text-black ${className}`}>
      {cells.map((c, i) => (
        <div key={i} className={cols[i].center ? "text-center" : ""} style={{ width: cols[i].w, minWidth: cols[i].min }}>
          {c}
        </div>
      ))}
    </div>
  );
}

function Table({ cols, head, rows, total }: { cols: Col[]; head: string[]; rows: ReactNode[][]; total?: string[] }) {
  return (
    <div className="overflow-x-auto">
      <div className="flex flex-col" style={{ minWidth: cols.reduce((s, c) => s + c.min, 0) }}>
        <div className="flex flex-col">
          <Row cols={cols} cells={head} className={HEAD} />
          {rows.map((r, i) => (
            <Row key={i} cols={cols} cells={r} className={BODY} />
          ))}
        </div>
        {total && <Row cols={cols} cells={total} className={TOTAL} />}
      </div>
    </div>
  );
}

function Card({ title, action, note, noteCls = "py-4 text-[12px]", className = "", children }: {
  title: string;
  action?: ReactNode;
  note: string;
  noteCls?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`flex min-w-0 flex-col rounded-[16px] border border-stroke2 bg-primary px-4 sm:px-5 ${className}`}>
      <div className="flex min-h-[72px] flex-wrap items-center justify-between gap-3 py-4">
        <h2 className="text-[18px] font-semibold tracking-[-0.36px] text-black">{title}</h2>
        {action}
      </div>
      {children}
      <p className={`text-muted ${noteCls}`}>{note}</p>
    </section>
  );
}

const RATE_COLS: Col[] = [{ w: 260, min: 160 }, { w: 140, min: 90, center: true }, { w: 140, min: 90, center: true }, { w: 140, min: 116, center: true }];
const BREAKDOWN_COLS: Col[] = [{ w: 260, min: 112 }, { w: 140, min: 108, center: true }, { w: 140, min: 80, center: true }];
const RECENT_COLS: Col[] = [
  { w: 260, min: 156 },
  { w: 140, min: 140 },
  { w: 140, min: 126 },
  { w: 140, min: 120, center: true },
  { w: 140, min: 144 },
  { w: 140, min: 66, center: true },
  { w: 140, min: 64, center: true },
];

// Edit overlay 1:8122 is styled differently from the shared Modal (Inter, #1e2834 border); inputs as in every form.
const editInput =
  "h-10 w-full rounded-[12px] border border-stroke2 bg-bg5 px-3.5 text-[14px] text-nav outline-none placeholder:text-nav/70 focus:border-stroke";
function EditField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[14px] text-nav">{label}</span>
      {children}
    </label>
  );
}

const label = "text-[13px] font-medium text-black opacity-70";
const column = "flex min-w-[220px] flex-1 flex-col justify-center gap-2";

export default function CalculatorPage() {
  // Figma toggle 1:8171: "Default" variant (1:8172) = NDOX selected.
  const [doc, setDoc] = useState<DocType>("NDOX");
  const toast = useToast();
  const [country, setCountry] = useState(COUNTRIES[0]);
  const [weight, setWeight] = useState("1.500");
  const kg = Math.min(MAX_KG, Math.max(0, Number(weight) || 0));

  const [recent, setRecent] = useState(RECENT_CALCS);
  const moreRef = useRef<HTMLButtonElement | null>(null);
  const [menuId, setMenuId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Calc | null>(null);
  const set = (k: keyof Calc) => (v: string) => setDraft((d) => d && { ...d, [k]: v });

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <PageHeader title="International Rate Calculator" subtitle="Enter Shipment Details And International Courier Tariffs" />

      {/* Shipment input (Figma 1:6266) */}
      <section className="flex flex-col gap-3 rounded-[16px] border border-stroke2 bg-primary p-4 sm:p-5">
        <div className="flex flex-wrap items-end gap-4">
          <div className={column}>
            <p className={label}>DOX / NDOX</p>
            {/* Variant change on click: Smart Animate 300ms ease-out = sliding pill */}
            <div className="relative flex w-fit gap-1 rounded-[12px] border border-stroke2 bg-bg5 p-[3px]">
              <span
                aria-hidden
                className={`absolute top-[3px] bottom-[3px] left-[3px] w-[100px] rounded-[9px] bg-button transition-transform ${doc === "NDOX" ? "translate-x-[104px]" : ""}`}
              />
              {DOC_TYPES.map((d) => (
                <button suppressHydrationWarning
                  key={d}
                  type="button"
                  aria-pressed={doc === d}
                  onClick={() => setDoc(d)}
                  className={`relative h-8 w-[100px] cursor-pointer rounded-[9px] text-[14px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${doc === d ? "text-white" : "text-black"}`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div className={column}>
            <p className={label}>Destination Country</p>
            <SelectField
              value={country}
              options={COUNTRIES}
              onChange={setCountry}
              icon="caret-down"
              iconSize={20}
              iconClass="text-nav"
              className="max-w-[400px] pr-3 text-nav"
            />
          </div>
          <div className={column}>
            <p className={label}>Weight (in kgs)</p>
            <label className="flex h-10 w-[180px] items-center gap-2 rounded-[12px] border border-stroke2 bg-bg5 pr-3 pl-3.5 text-[14px] font-medium text-nav transition-[border-color,box-shadow] focus-within:border-stroke focus-within:shadow-[0_0_0_3px_rgb(71_215_251/0.25)]">
              <input suppressHydrationWarning
                inputMode="decimal"
                aria-label="Weight (in kgs)"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                onBlur={() => setWeight(kg.toFixed(3))}
                className="w-full min-w-0 bg-transparent outline-none"
              />
              <span className="opacity-80">Kg</span>
            </label>
          </div>
          {/* No prototype action, and the mock tariffs can't be derived from the inputs. */}
          <button
            suppressHydrationWarning
            type="button"
            onClick={() => toast.info("Live rates aren't available yet", "The table below shows sample tariffs until real courier rates are connected.")}
            className="h-10 shrink-0 cursor-pointer rounded-[12px] bg-button px-4 text-[14px] font-medium whitespace-nowrap text-white transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Calculate Rates
          </button>
        </div>
        <p className="text-[12px] text-black opacity-50">Rate Calculator Supports Shipments Up To {MAX_KG} kg</p>
      </section>

      <Card title="Courier Rate Comparison" note={FSC_NOTE} action={<ToolButton label="Download" icon="download" onClick={() => toast.info("Download isn't available yet", "Rate exports will be added with live rates.")} />}>
        <Table cols={RATE_COLS} head={RATE_HEAD} rows={RATE_ROWS} total={RATE_TOTAL} />
      </Card>

      <div className="flex flex-col gap-4 min-[1400px]:flex-row">
        <Card title="Calculation Breakdown" note={FSC_NOTE} className="flex-1">
          <Table cols={BREAKDOWN_COLS} head={BREAKDOWN_HEAD} rows={BREAKDOWN_ROWS} total={BREAKDOWN_TOTAL} />
        </Card>
        <Card
          title="Reference Information"
          className="flex-1"
          noteCls="py-4 text-[13px]"
          note="Rates are illustrative andbased on the latest available rate chart entry. please update FDC using the international departments current rate"
        >
          <div className="flex flex-col rounded-[14px] bg-[rgb(71_215_251/0.16)] px-4 text-black">
            {[
              ["Rate Details", "DHL"],
              ["Document Type", doc],
              ["Destination Country", country],
              ["Weight (kg)", `${kg} kg`],
              ["Rate Chart Reference", RATE_CHART_REF],
            ].map(([k, v], i) => (
              <div
                key={k}
                className={`flex flex-col gap-1 border-stroke2 py-3 *:opacity-80 not-last:border-b sm:flex-row sm:items-center sm:gap-8 ${
                  i === 0 ? "text-[14px] font-semibold" : "text-[14px] font-medium"
                }`}
              >
                <p className="sm:shrink sm:basis-[220px]">{k}</p>
                <p className="min-w-0 whitespace-pre-wrap sm:flex-[1_1_455px]">{v}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Recent Calculations" note={FSC_NOTE}>
        <Table
          cols={RECENT_COLS}
          head={RECENT_HEAD}
          rows={recent.map((r) => [
            r.date, r.doc, r.country, r.weight, r.rates, r.tariff,
            <button suppressHydrationWarning
              key="more"
              type="button"
              aria-label="More actions"
              onClick={(e) => {
                moreRef.current = e.currentTarget;
                setMenuId((m) => (m === r.id ? null : r.id)); // the same button again closes it
              }}
              className="mx-auto flex size-8 cursor-pointer items-center justify-center rounded-[8px] text-nav hover:bg-bg5"
            >
              <Icon name="more" size={20} />
            </button>,
          ])}
        />
      </Card>

      {/* ⋮ → Edit/Delete menu 1:8158, hanging from the icon (right edges lined up) */}
      <Popover anchor={moreRef} open={menuId !== null} onClose={() => setMenuId(null)} align="end">
        <div className="flex w-[144px] flex-col text-[14px] text-nav">
          <button suppressHydrationWarning
            type="button"
            onClick={() => {
              setDraft(recent.find((r) => r.id === menuId) ?? null);
              setMenuId(null);
            }}
            className="flex h-9 cursor-pointer items-center gap-3 border-b border-stroke2 px-3.5 hover:bg-[rgb(71_215_251/0.2)]"
          >
            <Icon name="edit" size={18} />
            Edit
          </button>
          <button suppressHydrationWarning
            type="button"
            onClick={() => {
              setRecent((rs) => rs.filter((r) => r.id !== menuId));
              setMenuId(null);
            }}
            className="flex h-9 cursor-pointer items-center gap-3 px-3.5 hover:bg-[rgb(71_215_251/0.2)]"
          >
            <Icon name="delete" size={18} />
            Delete
          </button>
        </div>
      </Popover>

      {/* Edit overlay 1:8122 (Inter, dark stroke) on the shared dialog: page locked behind it, Escape, focus kept
          inside, pinned title and buttons. Figma's close glyph was white on the light dialog: the shared one shows. */}
      <Modal open={draft !== null} onClose={() => setDraft(null)} title="Edit" className="w-[720px] border-[#1e2834]! font-inter font-medium dark:border-stroke2!">
        {draft && (
          <>
              <div className="grid gap-x-3 gap-y-4 sm:grid-cols-2">
                <EditField label="Date & Time">
                  <input suppressHydrationWarning value={draft.date} onChange={(e) => set("date")(e.target.value)} placeholder="eg,26 jul 2026, 10:34 pm" className={editInput} />
                </EditField>
                <EditField label="Country">
                  <input suppressHydrationWarning value={draft.country} onChange={(e) => set("country")(e.target.value)} className={editInput} />
                </EditField>
              </div>
              <div className="grid items-center gap-x-3 gap-y-4 sm:grid-cols-3">
                <EditField label="Document Type">
                  <SelectField
                    value={draft.doc}
                    options={DOC_TYPES}
                    onChange={set("doc")}
                    iconClass="rotate-90 text-nav"
                    className="text-nav"
                  />
                </EditField>
                <EditField label="Weight">
                  <input suppressHydrationWarning value={draft.weight} onChange={(e) => set("weight")(e.target.value)} placeholder="000 kg" inputMode="decimal" className={editInput} />
                </EditField>
                <EditField label="Rate">
                  <input suppressHydrationWarning value={draft.rates} onChange={(e) => set("rates")(e.target.value)} placeholder="eg,26 jul 2026, 10:34 pm" className={editInput} />
                </EditField>
              </div>
              <EditField label="Tariff">
                <input suppressHydrationWarning value={draft.tariff} onChange={(e) => set("tariff")(e.target.value)} placeholder="eg., ORD-20260..." className={editInput} />
              </EditField>
            <ModalActions
              onCancel={() => setDraft(null)}
              onDone={() => {
                setRecent((rs) => rs.map((r) => (r.id === draft.id ? draft : r)));
                setDraft(null);
              }}
            />
          </>
        )}
      </Modal>
    </div>
  );
}
