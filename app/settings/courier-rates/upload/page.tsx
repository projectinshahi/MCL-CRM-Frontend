"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useToast } from "@/components/feedback";
import { Icon } from "@/components/Icon";
import { CardDetailsForm } from "@/components/rates/CardDetailsForm";
import { card, h2, primary, RatesFrame, secondary } from "@/components/rates/RatesFrame";
import { SkeletonLines } from "@/components/skeletons";
import { EmptyState, LoadFailed, SelectField, Spinner, TextInput } from "@/components/ui";
import { api, ApiError, dateTime, fieldErrors, upload, useApi, useDebounced, type List } from "@/lib/api";
import { cellText } from "@/lib/operations";
import { columnLetter, columnNumber, slabText, type CardDetails, type Courier, type RateCard, type ReadResult, type SheetWindow, type Slab, type TableLayout, type Workbook, type ZoneLayout } from "@/lib/rates";

// Settings → Courier Rate Management → Upload Courier Rate Excel:
// Select Courier → Select Account → Upload Excel → Preview → Validate → Save Rate Card.
// The API reads the table where it is pointed, and nothing is saved until "Save rate card". One file can hold several
// tables (FedEx's Doc, Pak and Package): after saving one, the next is read from the same file.

const STEPS = ["Courier & account", "Upload Excel", "Preview & validate", "Save rate card"];
const LB = "0.45359237";
const todayIST = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const n = (v: number) => v.toLocaleString("en-IN");
const num = "h-10 w-[84px] rounded-[12px] border border-stroke2 bg-bg5 px-3 text-[14px] font-medium text-black outline-none focus:border-stroke";
const small = "text-[13px] font-medium text-nav";

export default function UploadRatesPage() {
  const params = useSearchParams();
  const router = useRouter();
  const couriers = useApi<Courier[]>("/couriers");
  const [step, setStep] = useState(0);
  const [courierId, setCourierId] = useState(params.get("courier") ?? "");
  const [accountId, setAccountId] = useState<string | null>(params.get("account"));
  const [wb, setWb] = useState<Workbook | null>(null);
  const [layout, setLayout] = useState<TableLayout | null>(null);
  const [zones, setZones] = useState<ZoneLayout | null>(null);
  const [details, setDetails] = useState<CardDetails | null>(null);
  const [saved, setSaved] = useState<RateCard | null>(null);
  const [left, setLeft] = useState<string | null>(null); // the workbook just left: the address may name it a moment longer
  const toast = useToast();
  const courier = couriers.data?.find((c) => c.id === courierId) ?? null;

  // "Read another table" (and a refresh) carries on with the same workbook
  const importId = params.get("import");
  useEffect(() => {
    if (!importId || wb?.id === importId || importId === left) return;
    api<Workbook>(`/rate-imports/${importId}`)
      .then((w) => {
        setWb(w);
        setStep((s) => (s < 2 ? 2 : s));
      })
      .catch((err) => toast.apiError(err, "Couldn't open that workbook"));
  }, [importId, wb?.id, left, toast]);

  const choose = (w: Workbook) => {
    setWb(w);
    const first = w.sheets.find((s) => s.tables.length) ?? w.sheets[0]!;
    setLayout(first.tables[0] ? strip(first.tables[0]) : { sheet: first.index, orientation: "weights_down", headerRow: 1, labelColumn: 1, lastColumn: Math.max(2, first.columns), firstRow: 2, lastRow: Math.max(2, Math.min(first.rows, 30)), unit: "kg" });
    setZones(w.sheets.find((s) => s.zoneList)?.zoneList ?? null);
    setStep(2);
    router.replace(`/settings/courier-rates/upload?courier=${courierId}${accountId ? `&account=${accountId}` : ""}&import=${w.id}`);
  };

  return (
    <RatesFrame sub={null} action={<Link href="/settings/courier-rates" className={secondary}>Back to rate cards</Link>}>
      <ol className="flex flex-wrap items-center gap-2 text-[14px] font-medium" aria-label="Upload steps">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined} className={`flex items-center gap-2 ${i === step ? "text-selected" : i < step ? "text-black" : "text-nav/60"}`}>
            <span className={`flex size-6 items-center justify-center rounded-full text-[12px] ${i <= step ? "bg-button text-white" : "border border-stroke2"}`}>{i < step || saved ? "✓" : i + 1}</span>
            {s}
            {i < STEPS.length - 1 && <span aria-hidden className="mx-1 h-px w-6 bg-stroke2" />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className={card}>
          <h2 className={h2}>Select the courier and account</h2>
          {!couriers.data && !couriers.error && <SkeletonLines rows={2} />}
          {!couriers.data && couriers.error && <LoadFailed what="couriers" onRetry={couriers.reload} />}
          {couriers.data?.length === 0 && (
            <EmptyState>
              No couriers yet. <Link href="/settings/courier-rates/couriers" className="font-semibold text-link">Add the courier</Link> first.
            </EmptyState>
          )}
          {couriers.data && couriers.data.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-[14px] font-medium text-black">Courier</span>
                <SelectField value={courierId} placeholder="Choose the courier" options={couriers.data.filter((c) => c.active).map((c) => ({ value: c.id, label: c.name }))} onChange={(v) => (setCourierId(v), setAccountId(null), setDetails(null))} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[14px] font-medium text-black">Account</span>
                <SelectField
                  value={accountId ?? ""}
                  options={[{ value: "", label: "General rates (no account)" }, ...(courier?.accounts.filter((a) => a.active).map((a) => ({ value: a.id, label: a.name })) ?? [])]}
                  onChange={(v) => setAccountId(v || null)}
                />
                <span className="text-[13px] text-nav">An account&apos;s rates are only used when that account is chosen in the calculator.</span>
              </label>
            </div>
          )}
          <div className="flex justify-end">
            <button suppressHydrationWarning type="button" disabled={!courierId} onClick={() => setStep(1)} className={`${primary} disabled:cursor-not-allowed`}>
              Next
            </button>
          </div>
        </section>
      )}

      {step === 1 && <UploadStep onUploaded={choose} onBack={() => setStep(0)} />}

      {step >= 2 && step < 4 && !wb && <SkeletonLines rows={6} />}
      {step === 2 && wb && layout && (
        <PreviewStep
          wb={wb}
          layout={layout}
          setLayout={setLayout}
          zones={zones}
          setZones={setZones}
          onBack={() => setStep(1)}
          onNext={() => {
            const sheet = wb.sheets.find((s) => s.index === layout.sheet)?.name ?? "";
            setDetails((d) => d ?? { courierId, accountId, name: `${courier?.name ?? ""} ${sheet}`.trim(), scope: "international", service: "", contents: "any", origin: "", currency: "INR", effectiveFrom: todayIST(), effectiveTo: null, active: true, fuelPercent: null, gstPercent: null, gstIncluded: false, charges: [] });
            setStep(3);
          }}
        />
      )}
      {step === 3 && wb && layout && details && (
        <SaveStep
          wb={wb}
          layout={layout}
          zones={zones}
          details={{ ...details, courierId, accountId }}
          setDetails={setDetails}
          accounts={courier?.accounts.filter((a) => a.active) ?? []}
          onBack={() => setStep(2)}
          onSaved={(c) => {
            setSaved(c);
            setStep(4);
          }}
        />
      )}
      {step === 4 && saved && wb && (
        <section className={card}>
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-success/15 text-[20px] text-success">✓</span>
            <div className="flex flex-col">
              <h2 className={h2}>Saved “{saved.name}”</h2>
              <p className="text-[14px] text-nav">
                {saved.courier.name} · {saved.account?.name ?? "general rates"} · {n(saved.prices)} prices{saved.destinations ? ` · ${n(saved.destinations)} destinations` : ""} · the calculator uses it {saved.active ? "from " + saved.effectiveFrom : "once it is made active"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              suppressHydrationWarning
              type="button"
              onClick={() => {
                setSaved(null);
                setDetails((d) => d && { ...d, name: "" });
                setStep(2);
              }}
              className={secondary}
            >
              Read another table from this file
            </button>
            <button suppressHydrationWarning type="button" onClick={() => (setLeft(wb.id), setWb(null), setSaved(null), setDetails(null), setStep(1), router.replace(`/settings/courier-rates/upload?courier=${courierId}${accountId ? `&account=${accountId}` : ""}`))} className={secondary}>
              Upload another file
            </button>
            <Link href={`/settings/courier-rates/${saved.id}`} className={primary}>
              View rate card
            </Link>
          </div>
        </section>
      )}
    </RatesFrame>
  );
}

/** A suggested table as a layout (without its size). */
const strip = (t: TableLayout & { cells?: number }): TableLayout => ({ sheet: t.sheet, orientation: t.orientation, headerRow: t.headerRow, labelColumn: t.labelColumn, lastColumn: t.lastColumn, firstRow: t.firstRow, lastRow: t.lastRow, unit: t.unit });

/* ---------- 2. Upload ---------- */

function UploadStep({ onUploaded, onBack }: { onUploaded: (w: Workbook) => void; onBack: () => void }) {
  const [over, setOver] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string>();
  const recent = useApi<List<{ id: string; fileName: string; createdAt: string; createdBy: { name: string }; cards: { id: string; name: string }[] }>>("/rate-imports", { pageSize: 5 });
  const toast = useToast();
  const send = async (f: File | undefined) => {
    if (!f || progress !== null) return;
    setError(undefined);
    setProgress(0);
    const body = new FormData();
    body.append("file", f);
    try {
      onUploaded(await upload<Workbook>("/rate-imports", body, setProgress));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The file could not be uploaded.");
    } finally {
      setProgress(null);
    }
  };
  return (
    <>
      <section className={card}>
        <h2 className={h2}>Upload the courier&apos;s rate Excel</h2>
        <label
          onDragOver={(e) => (e.preventDefault(), setOver(true))}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => (e.preventDefault(), setOver(false), send(e.dataTransfer.files[0]))}
          data-over={over || undefined}
          className={`flex flex-col items-center gap-2 rounded-[12px] border border-dashed border-nav/30 bg-bg5 px-5 py-10 text-center text-[14px] font-medium text-black transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus data-over:border-button data-over:bg-[rgb(71_215_251/0.12)] ${progress !== null ? "cursor-wait" : "cursor-pointer hover:border-button"}`}
        >
          <input suppressHydrationWarning type="file" accept=".xlsx,.xlsm,.xls" disabled={progress !== null} className="sr-only" onChange={(e) => (send(e.target.files?.[0]), (e.target.value = ""))} />
          <Icon name="upload" size={28} className="text-nav" />
          {progress === null ? (
            <>
              <span>
                Drop the rate Excel here or <span className="text-link underline">browse</span>
              </span>
              <span className="text-[12px] font-normal text-nav">.xlsx, as the courier sent it · up to 20 MB · the prices are read exactly as in the file</span>
            </>
          ) : (
            <span className="flex items-center gap-2" role="status">
              <Spinner />
              {progress < 100 ? `Uploading… ${progress}%` : "Reading the workbook…"}
            </span>
          )}
        </label>
        {error && <p role="alert" className="rounded-[12px] border border-danger/40 bg-danger/5 px-3.5 py-2.5 text-[14px] text-danger">{error}</p>}
        <div className="flex justify-start">
          <button suppressHydrationWarning type="button" onClick={onBack} className={secondary}>Back</button>
        </div>
      </section>
      {recent.data && recent.data.items.length > 0 && (
        <section className={card}>
          <h2 className={h2}>Or read another table from a file uploaded before</h2>
          <ul className="flex flex-col divide-y divide-stroke2">
            {recent.data.items.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[14px]">
                <span className="flex min-w-0 flex-col">
                  <span className="font-semibold break-all text-black">{r.fileName}</span>
                  <span className="text-[13px] text-nav">{dateTime(r.createdAt)} · {r.createdBy.name} · {r.cards.length} rate card{r.cards.length === 1 ? "" : "s"} from it</span>
                </span>
                <button suppressHydrationWarning type="button" onClick={() => api<Workbook>(`/rate-imports/${r.id}`).then(onUploaded, (err) => toast.apiError(err, "Couldn't open the workbook"))} className="cursor-pointer font-semibold text-link hover:underline">
                  Use this file
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/* ---------- 3. Preview & validate ---------- */

function useRead(wbId: string, layout: TableLayout, zones: ZoneLayout | null) {
  const key = useDebounced(JSON.stringify({ table: layout, zones }), 350);
  const [state, setState] = useState<{ key: string; data: ReadResult | null; error: string | null }>({ key: "", data: null, error: null });
  useEffect(() => {
    let live = true;
    api<ReadResult>(`/rate-imports/${wbId}/read`, { method: "POST", body: JSON.parse(key) })
      .then((data) => live && setState({ key, data, error: null }))
      .catch((err) => live && setState({ key, data: null, error: err instanceof ApiError ? err.message : "The table couldn't be read." }));
    return () => {
      live = false;
    };
  }, [wbId, key]);
  return { ...state, loading: state.key !== JSON.stringify({ table: layout, zones }) };
}

function PreviewStep({ wb, layout, setLayout, zones, setZones, onBack, onNext }: {
  wb: Workbook;
  layout: TableLayout;
  setLayout: (t: TableLayout) => void;
  zones: ZoneLayout | null;
  setZones: (z: ZoneLayout | null) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const sheet = wb.sheets.find((s) => s.index === layout.sheet)!;
  const read = useRead(wb.id, layout, zones);
  const set = (p: Partial<TableLayout>) => setLayout({ ...layout, ...p });
  const r = read.data;
  const errors = r?.problems.filter((p) => p.level === "error") ?? [];
  const warnings = r?.problems.filter((p) => p.level === "warning") ?? [];
  const lists = wb.sheets.filter((s) => s.zoneList).map((s) => s.zoneList!);
  const zoneKey = zones ? `${zones.sheet}:${zones.headerRow}` : "";

  const setReading = (labelText: string, slab: Slab | null) => {
    const readings = { ...(layout.readings ?? {}) };
    if (slab) readings[labelText] = slab;
    else delete readings[labelText];
    set({ readings });
  };
  // Cards that price per kg (or per lb) at each weight (Canada, USA DPD): every flat reading made a per-unit price
  const perUnitAt = () =>
    set({ readings: Object.fromEntries((r?.weights ?? []).filter((w) => w.slab?.kind === "flat").map((w) => [w.label, { kind: "per_kg", fromKg: w.slab!.toKg!, toKg: w.slab!.toKg!, unitKg: layout.unit === "lb" ? LB : "1" } as Slab])) });

  return (
    <>
      <section className={card}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className={`${h2} break-all`}>{wb.fileName}</h2>
            <p className="text-[14px] text-nav">Point at one rate table: the tables found are offered first. Nothing is saved until the last step.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Sheets">
          {wb.sheets.map((s) => (
            <button
              suppressHydrationWarning
              key={s.index}
              type="button"
              role="tab"
              aria-selected={s.index === layout.sheet}
              onClick={() => setLayout(s.tables[0] ? strip(s.tables[0]) : { ...layout, sheet: s.index, readings: undefined })}
              className={`h-9 cursor-pointer rounded-[10px] px-3 text-[14px] font-medium transition-colors ${s.index === layout.sheet ? "bg-button text-white" : "border border-stroke2 bg-bg5 text-nav hover:bg-[rgb(71_215_251/0.2)]"}`}
            >
              {s.name} <span className="opacity-70">({n(s.rows)} rows)</span>
            </button>
          ))}
        </div>
        {sheet.tables.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className={small}>Tables found:</span>
            {sheet.tables.map((t, i) => {
              const on = t.firstRow === layout.firstRow && t.labelColumn === layout.labelColumn && t.orientation === layout.orientation;
              return (
                <button suppressHydrationWarning key={i} type="button" aria-pressed={on} onClick={() => setLayout(strip(t))} className={`cursor-pointer rounded-[10px] border px-2.5 py-1.5 text-[13px] font-medium ${on ? "border-button bg-[rgb(71_215_251/0.15)] text-selected" : "border-stroke2 text-nav hover:bg-bg5"}`}>
                  Rows {t.firstRow}–{t.lastRow}, {t.orientation === "weights_down" ? "weights down" : "weights across"} from column {columnLetter(t.labelColumn)}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-[14px] text-nav">No table was found on this sheet by itself: set its rows and columns below.</p>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex w-[230px] flex-col gap-1.5">
            <span className={small}>Weights are</span>
            <SelectField value={layout.orientation} options={[{ value: "weights_down", label: "Down the side (zones across)" }, { value: "weights_across", label: "Across the top (zones down)" }]} onChange={(v) => set({ orientation: v as TableLayout["orientation"], readings: undefined })} />
          </label>
          {(
            [
              ["Header row", "headerRow"],
              ["First row", "firstRow"],
              ["Last row", "lastRow"],
            ] as const
          ).map(([l, k]) => (
            <label key={k} className="flex flex-col gap-1.5">
              <span className={small}>{l}</span>
              <input suppressHydrationWarning type="number" min={1} value={layout[k]} onChange={(e) => set({ [k]: Math.max(1, Number(e.target.value) || 1) })} className={num} />
            </label>
          ))}
          {(
            [
              ["Label column", "labelColumn"],
              ["Last column", "lastColumn"],
            ] as const
          ).map(([l, k]) => (
            <label key={k} className="flex flex-col gap-1.5">
              <span className={small}>{l}</span>
              <input suppressHydrationWarning defaultValue={columnLetter(layout[k])} key={`${k}${layout[k]}`} onBlur={(e) => { const c = columnNumber(e.target.value); if (c) set({ [k]: c }); }} className={`${num} uppercase`} aria-label={`${l} (letter)`} />
            </label>
          ))}
          <label className="flex w-[110px] flex-col gap-1.5">
            <span className={small}>Weights in</span>
            <SelectField value={layout.unit} options={[{ value: "kg", label: "kg" }, { value: "lb", label: "lb" }]} onChange={(v) => set({ unit: v as TableLayout["unit"], readings: undefined })} />
          </label>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex w-full flex-col gap-1.5 sm:w-[420px]">
            <span className={small}>Destination → zone list</span>
            <SelectField
              value={zoneKey}
              options={[{ value: "", label: "None: destinations are the table's own headings" }, ...lists.map((z) => ({ value: `${z.sheet}:${z.headerRow}`, label: `${wb.sheets[z.sheet]?.name}: row ${z.headerRow}, columns ${z.pairs.map((p) => `${columnLetter(p.key)}→${columnLetter(p.zone)}`).join(", ")}` }))]}
              onChange={(v) => setZones(lists.find((z) => `${z.sheet}:${z.headerRow}` === v) ?? null)}
            />
          </label>
          {r?.zoneList && <span className="pb-2.5 text-[13px] text-nav">{n(r.zoneList.count)} destinations in zones {r.zoneList.zones.slice(0, 14).join(", ")}{r.zoneList.zones.length > 14 ? "…" : ""}</span>}
        </div>
        <SheetView wbId={wb.id} layout={layout} />
      </section>

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={h2}>What will be saved</h2>
          {read.loading && <span className="flex items-center gap-2 text-[13px] text-nav"><Spinner /> Reading…</span>}
        </div>
        {read.error && <p role="alert" className="text-[14px] text-danger">{read.error}</p>}
        {!r && !read.error && <SkeletonLines rows={4} />}
        {r && (
          <>
            <p className="text-[14px] text-black">
              <b>{n(r.weights.length)}</b> weights × <b>{n(r.zones.length)}</b> {zones ? "zones" : "destinations"}: <b>{n(r.prices)}</b> prices
              {r.empty > 0 && <>, {n(r.empty)} empty cells (no rate there)</>}.
            </p>
            {(errors.length > 0 || warnings.length > 0) && (
              <ul className="flex max-h-[220px] flex-col gap-1 overflow-y-auto rounded-[12px] border border-stroke2 p-3 text-[13px]">
                {[...errors, ...warnings].slice(0, 60).map((p, i) => (
                  <li key={i} className={`flex gap-1.5 ${p.level === "error" ? "text-danger" : "text-black"}`}>
                    <Icon name="warning" size={16} className={`shrink-0 ${p.level === "error" ? "text-danger" : "text-warn"}`} />
                    <span>
                      {p.cell && <b className="mr-1">{p.cell}</b>}
                      {p.message}
                    </span>
                  </li>
                ))}
                {errors.length + warnings.length > 60 && <li className="text-nav">…and {n(errors.length + warnings.length - 60)} more</li>}
              </ul>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[15px] font-semibold text-black">How each weight is read</h3>
              <div className="flex flex-wrap gap-2">
                {r.weights.some((w) => w.slab?.kind === "flat") && (
                  <button suppressHydrationWarning type="button" onClick={perUnitAt} className={secondary}>
                    Prices are per {layout.unit} at each weight
                  </button>
                )}
                {layout.readings && Object.keys(layout.readings).length > 0 && (
                  <button suppressHydrationWarning type="button" onClick={() => set({ readings: undefined })} className={secondary}>
                    Read them as written
                  </button>
                )}
              </div>
            </div>
            <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {r.weights.map((w) => (
                <WeightReading key={w.at} w={w} unit={layout.unit} onSet={(s) => setReading(w.label, s)} />
              ))}
            </ul>
            <PriceGrid r={r} />
          </>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button suppressHydrationWarning type="button" onClick={onBack} className={secondary}>Back</button>
          <button suppressHydrationWarning type="button" onClick={onNext} disabled={!r || errors.length > 0 || read.loading} className={`${primary} disabled:cursor-not-allowed`}>
            {errors.length ? `Fix ${errors.length} problem${errors.length === 1 ? "" : "s"} first` : "Next: rate card details"}
          </button>
        </div>
      </section>
    </>
  );
}

/** The sheet around the table, with its header, labels and body shaded: what is being read, as in Excel. */
function SheetView({ wbId, layout }: { wbId: string; layout: TableLayout }) {
  const from = Math.max(1, Math.min(layout.headerRow, layout.firstRow) - 2);
  const to = Math.min(from + 119, Math.max(layout.lastRow, layout.headerRow) + 2);
  const win = useApi<SheetWindow>(`/rate-imports/${wbId}/sheets/${layout.sheet}`, { from, to }, 0, { keep: true });
  const cols = Math.min(30, Math.max(layout.lastColumn + 1, ...(win.data?.rows.map((r) => r.length) ?? [1])));
  const shade = (row: number, c: number) => {
    const body = row >= layout.firstRow && row <= layout.lastRow;
    const inTable = c >= layout.labelColumn && c <= layout.lastColumn;
    if (row === layout.headerRow && c > layout.labelColumn && inTable) return "bg-[rgb(71_215_251/0.28)] font-semibold";
    if (body && c === layout.labelColumn) return "bg-[rgb(110_133_229/0.2)] font-semibold";
    if (body && inTable) return "bg-[rgb(71_215_251/0.08)]";
    return "text-nav/70";
  };
  if (!win.data) return <SkeletonLines rows={4} />;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[12px] text-nav">
        Rows {win.data.from}–{win.data.from + win.data.rows.length - 1} of {n(win.data.total)}: <span className="rounded bg-[rgb(71_215_251/0.28)] px-1">header</span> <span className="rounded bg-[rgb(110_133_229/0.2)] px-1">weights / destinations</span> <span className="rounded bg-[rgb(71_215_251/0.08)] px-1">prices</span>
      </p>
      <div className="table-scroll max-h-[360px] overflow-y-auto rounded-[12px] border border-stroke2">
        <table className="w-max min-w-full border-collapse text-[12px]">
          <thead className="sticky top-0 z-[1] bg-primary">
            <tr>
              <th className="sticky left-0 bg-primary px-2 py-1 text-nav" />
              {Array.from({ length: cols }, (_, i) => (
                <th key={i} className="border-l border-stroke2 px-2 py-1 font-medium text-nav">{columnLetter(i + 1)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {win.data.rows.map((cells, i) => {
              const row = win.data!.from + i;
              return (
                <tr key={row} className="border-t border-stroke2">
                  <td className="sticky left-0 bg-primary px-2 py-1 text-right text-nav">{row}</td>
                  {Array.from({ length: cols }, (_, c) => (
                    <td key={c} className={`max-w-[160px] truncate border-l border-stroke2 px-2 py-1 text-black ${shade(row, c + 1)}`} title={cellText(cells[c] ?? null)}>
                      {cellText(cells[c] ?? null)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** One weight label and how it is read, with a way to say what it means. */
function WeightReading({ w, unit, onSet }: { w: ReadResult["weights"][number]; unit: "kg" | "lb"; onSet: (s: Slab | null) => void }) {
  const [open, setOpen] = useState(false);
  const s = w.slab;
  const [kind, setKind] = useState<"flat" | "range" | "at" | "above" | "additional">(s?.kind === "additional" ? "additional" : s?.kind === "per_kg" ? (s.toKg === null ? "above" : s.toKg === s.fromKg ? "at" : "range") : "flat");
  const [a, setA] = useState(s ? String(Number(s.kind === "flat" ? s.toKg : s.kind === "additional" ? s.unitKg : s.fromKg)) : "");
  const [b, setB] = useState(s?.toKg && s.kind === "per_kg" ? String(Number(s.toKg)) : "");
  const [per, setPer] = useState(s?.unitKg === LB ? "lb" : unit);
  const apply = () => {
    const unitKg = per === "lb" ? LB : "1";
    const slab: Slab | null =
      !a || Number(a) <= 0
        ? null
        : kind === "flat"
          ? { kind: "flat", fromKg: "0", toKg: a, unitKg: null }
          : kind === "additional"
            ? { kind: "additional", fromKg: "0", toKg: null, unitKg: a }
            : { kind: "per_kg", fromKg: a, toKg: kind === "range" ? b || null : kind === "at" ? a : null, unitKg };
    onSet(slab);
    setOpen(false);
  };
  return (
    <li className="flex flex-col gap-1 border-b border-stroke2 py-1.5 text-[13px]">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0">
          <b className="text-black">{w.label}</b> <span className={w.slab ? "text-nav" : "text-danger"}>→ {slabText(w.slab)}</span>
          {w.read === "set" && <span className="ml-1 text-selected">(set)</span>}
        </span>
        <button suppressHydrationWarning type="button" onClick={() => setOpen((o) => !o)} className="shrink-0 cursor-pointer font-semibold text-link">
          {open ? "Close" : "Change"}
        </button>
      </div>
      {open && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-[10px] bg-bg5 p-2">
          <div className="w-[190px]">
            <SelectField
              value={kind}
              options={[
                { value: "flat", label: "Price up to … kg" },
                { value: "range", label: "Per kg, from … to … kg" },
                { value: "above", label: "Per kg, from … kg up" },
                { value: "at", label: "Per kg, at … kg" },
                { value: "additional", label: "Each further … kg" },
              ]}
              onChange={(v) => setKind(v as typeof kind)}
            />
          </div>
          <TextInput value={a} onChange={(e) => setA(e.target.value)} inputMode="decimal" aria-label="kg" className="w-[80px]!" />
          {kind === "range" && (
            <>
              to <TextInput value={b} onChange={(e) => setB(e.target.value)} inputMode="decimal" aria-label="to kg" className="w-[80px]!" />
            </>
          )}
          kg
          {(kind === "range" || kind === "above" || kind === "at") && (
            <div className="w-[110px]">
              <SelectField value={per} options={[{ value: "kg", label: "per kg" }, { value: "lb", label: "per lb" }]} onChange={(v) => setPer(v as "kg" | "lb")} />
            </div>
          )}
          <button suppressHydrationWarning type="button" onClick={apply} className="h-9 cursor-pointer rounded-[10px] bg-button px-3 text-[13px] font-medium text-white">Use</button>
          {w.read === "set" && <button suppressHydrationWarning type="button" onClick={() => (onSet(null), setOpen(false))} className="cursor-pointer text-[13px] font-semibold text-link">As written</button>}
        </div>
      )}
    </li>
  );
}

function PriceGrid({ r }: { r: ReadResult }) {
  const zones = r.zones.slice(0, 24);
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-[15px] font-semibold text-black">Prices as they will be saved{r.zones.length > zones.length ? ` (first ${zones.length} of ${r.zones.length} columns)` : ""}</h3>
      <div className="table-scroll max-h-[420px] overflow-y-auto rounded-[12px] border border-stroke2">
        <table className="w-max min-w-full border-collapse text-[12px]">
          <thead className="sticky top-0 z-[1] bg-primary">
            <tr>
              <th className="sticky left-0 bg-primary px-2 py-1.5 text-left font-medium text-nav">Weight</th>
              {zones.map((z) => (
                <th key={z.at} className="max-w-[140px] border-l border-stroke2 px-2 py-1.5 text-left font-semibold text-black">{z.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.weights.map((w, i) => (
              <tr key={w.at} className="border-t border-stroke2">
                <td className="sticky left-0 bg-primary px-2 py-1 font-semibold whitespace-nowrap text-black">{w.label}</td>
                {zones.map((z, j) => (
                  <td key={z.at} className={`border-l border-stroke2 px-2 py-1 text-right ${r.grid[i]?.[j] ? "text-black" : "text-nav/50"}`}>{r.grid[i]?.[j] ?? "–"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- 4. Save ---------- */

function SaveStep({ wb, layout, zones, details, setDetails, accounts, onBack, onSaved }: {
  wb: Workbook;
  layout: TableLayout;
  zones: ZoneLayout | null;
  details: CardDetails;
  setDetails: (d: CardDetails) => void;
  accounts: { id: string; name: string }[];
  onBack: () => void;
  onSaved: (c: RateCard) => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const save = async () => {
    if (saving) return;
    setSaving(true);
    setErrors({});
    try {
      const c = await api<RateCard>(`/rate-imports/${wb.id}/save`, { method: "POST", body: { table: layout, zones, details } });
      toast.success("Rate card saved", `${c.name}: ${c.prices} prices`);
      onSaved(c);
    } catch (err) {
      const f = fieldErrors(err);
      setErrors(Object.fromEntries(Object.entries(f).map(([k, v]) => [k.replace(/^details\./, ""), v])));
      toast.apiError(err, "Couldn't save the rate card");
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className={card}>
      <div className="flex flex-col gap-0.5">
        <h2 className={h2}>Rate card details</h2>
        <p className="text-[14px] text-nav">From {wb.fileName}, sheet “{wb.sheets.find((s) => s.index === layout.sheet)?.name}”, rows {layout.firstRow}–{layout.lastRow}. Fuel surcharge, GST and other charges are added to its prices by the calculator.</p>
      </div>
      <CardDetailsForm value={details} onChange={setDetails} accounts={accounts} errors={errors} />
      {errors.table && <p role="alert" className="text-[14px] text-danger">{errors.table}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button suppressHydrationWarning type="button" onClick={onBack} className={secondary}>Back to the preview</button>
        <button suppressHydrationWarning type="button" onClick={save} disabled={saving} className={primary}>
          {saving && <Spinner />}
          Save rate card
        </button>
      </div>
    </section>
  );
}
