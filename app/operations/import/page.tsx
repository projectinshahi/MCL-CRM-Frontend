"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useConfirm, useToast } from "@/components/feedback";
import { Icon } from "@/components/Icon";
import { SkeletonLines } from "@/components/skeletons";
import { Badge, col, EmptyState, LoadFailed, PageHeader, Pagination, SelectField, Spinner } from "@/components/ui";
import { api, dateTime, download, paging, upload, useApi, type List } from "@/lib/api";
import type { StatusTone } from "@/lib/status";
import { cellText, type CheckedRow, type Fields, type ImportMode, type ImportSummary, type ImportView, type Target } from "@/lib/operations";

// Operations → Upload Excel: Upload → Map → Check → Import → Done. Shipment workbooks only (courier rate cards have
// their own import). Every step is the API's: the file is read and its rows staged on upload, checked with the chosen
// mapping, and imported in one transaction; this page only shows each step and collects the choices.

const btn = "flex h-10 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[12px] px-4 text-[14px] font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-wait disabled:opacity-70";
const primary = `${btn} bg-button text-white hover:bg-secondary`;
const secondary = `${btn} border border-button bg-white text-black hover:bg-bg5 dark:bg-transparent`;
const card = "flex min-w-0 flex-col gap-4 rounded-[16px] border border-stroke2 bg-primary p-4 sm:p-5";
const h2 = "text-[18px] font-semibold tracking-[-0.36px] text-black";
const n = (v: number | undefined) => (v ?? 0).toLocaleString("en-IN");
const letter = (i: number) => {
  let s = "";
  for (let x = i + 1; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};

export default function ImportPage() {
  const params = useSearchParams();
  const router = useRouter();
  const resumeId = params.get("id");
  const [imp, setImp] = useState<ImportView | null>(null);
  const [file, setFile] = useState<File | null>(null); // kept to read another sheet or header row
  const [editing, setEditing] = useState(false); // back from Check to change the mapping
  const [loadError, setLoadError] = useState(false);
  const [left, setLeft] = useState<string | null>(null); // the import just left: the address may name it a moment longer
  const toast = useToast();

  // A refresh, or a link from the recent imports, carries on with that import.
  const resuming = !!resumeId && resumeId !== imp?.id && resumeId !== left;
  useEffect(() => {
    if (!resuming) return;
    api<ImportView>(`/operations/imports/${resumeId}`)
      .then((view) => (setImp(view), setLoadError(false)))
      .catch((err) => {
        setLoadError(true);
        toast.apiError(err, "Couldn't open that import");
      });
  }, [resuming, resumeId, toast]);

  const adopt = (view: ImportView) => {
    setImp(view);
    setEditing(false);
    if (view.id !== resumeId) router.replace(`/operations/import?id=${view.id}`);
  };
  const restart = () => {
    setLeft(imp?.id ?? resumeId);
    setImp(null);
    setFile(null);
    setEditing(false);
    setLoadError(false);
    router.replace("/operations/import");
  };

  const step = !imp ? "upload" : imp.status === "imported" ? "done" : imp.status === "validated" && !editing ? "check" : imp.status === "cancelled" ? "upload" : "map";
  const STEPS = ["Upload", "Map columns", "Check", "Import"];
  const at = { upload: 0, map: 1, check: 2, done: 3 }[step];
  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <PageHeader
        title="Upload Excel"
        subtitle="Import the shipment workbook into All Operations"
        action={
          <Link href="/operations" className={secondary}>
            Back to All Operations
          </Link>
        }
      />
      <ol className="flex flex-wrap items-center gap-2 text-[14px] font-medium" aria-label="Import steps">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === at ? "step" : undefined} className={`flex items-center gap-2 ${i === at ? "text-selected" : i < at ? "text-black" : "text-nav/60"}`}>
            <span className={`flex size-6 items-center justify-center rounded-full text-[12px] ${i <= at ? "bg-button text-white" : "border border-stroke2"}`}>{i < at || step === "done" ? "✓" : i + 1}</span>
            {s}
            {i < STEPS.length - 1 && <span aria-hidden className="mx-1 h-px w-6 bg-stroke2" />}
          </li>
        ))}
      </ol>

      {resuming && !loadError && <SkeletonLines rows={6} />}
      {step === "upload" && (!resuming || loadError) && <UploadStep onUploaded={(view, f) => (setFile(f), adopt(view))} />}
      {imp && step === "map" && <MapStep key={imp.id} imp={imp} file={file} onChecked={adopt} onReplaced={adopt} onCancelled={restart} />}
      {imp && step === "check" && <CheckStep imp={imp} onBack={() => setEditing(true)} onImported={adopt} onCancelled={restart} />}
      {imp && step === "done" && <DoneStep imp={imp} onAnother={restart} />}
    </div>
  );
}

/* ---------- 1. Upload ---------- */

function UploadStep({ onUploaded }: { onUploaded: (view: ImportView, file: File) => void }) {
  const [over, setOver] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string>();
  const [template, setTemplate] = useState(false);
  const toast = useToast();
  const recent = useApi<List<ImportSummary>>("/operations/imports", { pageSize: 5 });

  const send = async (f: File | undefined) => {
    if (!f || progress !== null) return;
    setError(undefined);
    setProgress(0);
    const body = new FormData();
    body.append("file", f);
    try {
      onUploaded(await upload<ImportView>("/operations/imports", body, setProgress), f);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The file could not be uploaded.");
    } finally {
      setProgress(null);
    }
  };
  const getTemplate = async () => {
    setTemplate(true);
    try {
      toast.success("Template downloaded", await download("/operations/template"));
    } catch (err) {
      toast.apiError(err, "Couldn't download the template");
    } finally {
      setTemplate(false);
    }
  };

  return (
    <>
      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={h2}>Choose the shipment workbook</h2>
          <button suppressHydrationWarning type="button" onClick={getTemplate} disabled={template} className={secondary}>
            {template ? <Spinner /> : <Icon name="download" size={16} />}
            Download Sample Template
          </button>
        </div>
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            send(e.dataTransfer.files[0]);
          }}
          data-over={over || undefined}
          className={`flex flex-col items-center gap-2 rounded-[12px] border border-dashed border-nav/30 bg-bg5 px-5 py-10 text-center text-[14px] font-medium text-black transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus data-over:border-button data-over:bg-[rgb(71_215_251/0.12)] ${progress !== null ? "cursor-wait" : "cursor-pointer hover:border-button"}`}
        >
          <input
            suppressHydrationWarning
            type="file"
            accept=".xlsx,.xlsm,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={progress !== null}
            className="sr-only"
            onChange={(e) => {
              send(e.target.files?.[0]);
              e.target.value = ""; // the same file can be chosen again
            }}
          />
          <Icon name="upload" size={28} className="text-nav" />
          {progress === null ? (
            <>
              <span>
                Drop the Excel file here or <span className="text-link underline">browse</span>
              </span>
              <span className="text-[12px] font-normal text-nav">Excel workbook (.xlsx) · up to 20 MB and 25,000 rows · nothing is imported until you confirm</span>
            </>
          ) : (
            <span className="flex items-center gap-2" role="status">
              <Spinner />
              {progress < 100 ? `Uploading… ${progress}%` : "Reading the workbook…"}
            </span>
          )}
        </label>
        {error && (
          <p role="alert" className="rounded-[12px] border border-danger/40 bg-danger/5 px-3.5 py-2.5 text-[14px] text-danger">
            {error}
          </p>
        )}
      </section>

      <section className={card}>
        <h2 className={h2}>Recent imports</h2>
        {!recent.data && !recent.error && <SkeletonLines rows={3} />}
        {!recent.data && recent.error && <LoadFailed what="recent imports" onRetry={recent.reload} />}
        {recent.data?.items.length === 0 && <EmptyState>No imports yet.</EmptyState>}
        {recent.data && recent.data.items.length > 0 && (
          <ul className="flex flex-col divide-y divide-stroke2">
            {recent.data.items.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[14px]">
                <div className="flex min-w-0 flex-col">
                  <span className="font-semibold break-all text-black">{r.fileName}</span>
                  <span className="text-[13px] text-nav">
                    {dateTime(r.importedAt ?? r.createdAt)} · {r.createdBy.name} · {n(r.rowCount)} rows
                    {r.status === "imported" && ` · ${n(r.totals.created)} added, ${n(r.totals.updated)} updated`}
                  </span>
                </div>
                {r.status === "imported" ? (
                  <Link href={`/operations?importId=${r.id}`} className="font-semibold text-link hover:underline">
                    View shipments
                  </Link>
                ) : (
                  <Link href={`/operations/import?id=${r.id}`} className="font-semibold text-link hover:underline">
                    Continue ({r.status === "validated" ? "checked" : "not checked"})
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/* ---------- 2. Map columns ---------- */

function MapStep({ imp, file, onChecked, onReplaced, onCancelled }: {
  imp: ImportView;
  file: File | null;
  onChecked: (v: ImportView) => void;
  onReplaced: (v: ImportView) => void;
  onCancelled: () => void;
}) {
  const fields = useApi<Fields>("/operations/fields", undefined, 0, { keep: true });
  const [mapping, setMapping] = useState<Target[]>(imp.mapping);
  const [matchKey, setMatchKey] = useState(imp.matchKey);
  const [mode, setMode] = useState<ImportMode>(imp.mode ?? "add");
  const [remember, setRemember] = useState(true);
  const [headerRow, setHeaderRow] = useState(String(imp.headerRow));
  const [busy, setBusy] = useState<"check" | "reread" | "cancel" | null>(null);
  const [error, setError] = useState<string>();
  const toast = useToast();
  const list = fields.data?.fields ?? [];
  const label = (t: Target) => (t === "extra" ? "Keep as an extra column" : t === "skip" ? "Don't import" : (list.find((f) => f.key === t)?.header ?? t));
  const targets = [...list.map((f) => ({ value: f.key, label: f.header })), { value: "extra", label: label("extra") }, { value: "skip", label: label("skip") }];
  const twice = new Set(mapping.filter((t, i) => t !== "extra" && t !== "skip" && mapping.indexOf(t) !== i));
  const missing = list.filter((f) => !mapping.includes(f.key));
  const keys = (fields.data?.matchKeys ?? []).filter((k) => mapping.includes(k));
  const key = keys.includes(matchKey) ? matchKey : (keys[0] ?? "");

  const check = async () => {
    setError(undefined);
    if (twice.size) return setError("Two columns are saved as the same field. Choose one for each.");
    if (!key) return setError("Save one column as AWB Number, AWB No. or Forwarding No.: shipments are matched by it.");
    setBusy("check");
    try {
      onChecked(await api<ImportView>(`/operations/imports/${imp.id}/validate`, { method: "POST", body: { mapping, matchKey: key, mode, remember } }));
    } catch (err) {
      toast.apiError(err, "Couldn't check the data");
    } finally {
      setBusy(null);
    }
  };
  // Another sheet or header row: the file is read again as a new upload, and this one is cancelled.
  const reread = async (sheet: string, row: string) => {
    if (!file) return;
    setBusy("reread");
    const body = new FormData();
    body.append("sheet", sheet);
    if (row) body.append("headerRow", row);
    body.append("file", file);
    try {
      const view = await upload<ImportView>("/operations/imports", body);
      await api(`/operations/imports/${imp.id}/cancel`, { method: "POST" }).catch(() => undefined);
      onReplaced(view);
    } catch (err) {
      toast.apiError(err, "Couldn't read that sheet");
    } finally {
      setBusy(null);
    }
  };
  const cancel = async () => {
    setBusy("cancel");
    try {
      await api(`/operations/imports/${imp.id}/cancel`, { method: "POST" });
      onCancelled();
    } catch (err) {
      toast.apiError(err, "Couldn't cancel the upload");
      setBusy(null);
    }
  };

  return (
    <>
      <section className={card}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className={`${h2} break-all`}>{imp.fileName}</h2>
            <p className="text-[14px] text-nav">
              Sheet “{imp.sheetName}” · headers in row {imp.headerRow} · {n(imp.rowCount)} data rows
            </p>
          </div>
          <button suppressHydrationWarning type="button" onClick={cancel} disabled={!!busy} className={secondary}>
            {busy === "cancel" && <Spinner />}
            Cancel upload
          </button>
        </div>
        {imp.sameFile && (
          <p role="status" className="rounded-[12px] border border-warn/40 bg-warn/10 px-3.5 py-2.5 text-[14px] text-black">
            This exact file was already imported on {dateTime(imp.sameFile.importedAt)} by {imp.sameFile.by}. Importing it again adds nothing new in Add mode; use Update mode to apply changes.
          </p>
        )}
        {file && (
          <div className="flex flex-wrap items-end gap-3">
            {imp.sheets.length > 1 && (
              <label className="flex w-full flex-col gap-1.5 sm:w-[280px]">
                <span className="text-[13px] font-medium text-nav">Sheet</span>
                <SelectField
                  value={imp.sheetName}
                  options={imp.sheets.map((s) => ({ value: s.name, label: `${s.name} (${n(s.rows)} rows)` }))}
                  onChange={(s) => s !== imp.sheetName && reread(s, "")}
                />
              </label>
            )}
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-nav">Header row</span>
              <input
                suppressHydrationWarning
                type="number"
                min={1}
                value={headerRow}
                onChange={(e) => setHeaderRow(e.target.value)}
                className="h-10 w-24 rounded-[12px] border border-stroke2 bg-bg5 px-3.5 text-[14px] font-medium text-black outline-none focus:border-stroke"
              />
            </label>
            {headerRow !== String(imp.headerRow) && Number(headerRow) >= 1 && (
              <button suppressHydrationWarning type="button" onClick={() => reread(imp.sheetName, headerRow)} disabled={!!busy} className={secondary}>
                {busy === "reread" && <Spinner />}
                Read again from row {headerRow}
              </button>
            )}
          </div>
        )}
      </section>

      <section className={card}>
        <div className="flex flex-col gap-0.5">
          <h2 className={h2}>Map the columns</h2>
          <p className="text-[14px] text-nav">
            Columns are matched to the CRM by their exact header name{imp.savedMapping ? ", using the mapping saved for this layout" : ""}. Columns that are not one of the CRM&apos;s are kept as extra columns under their own names unless you choose otherwise.
          </p>
        </div>
        {!fields.data && <SkeletonLines rows={6} />}
        {fields.data && (
          <div className="table-scroll">
            <div className="flex min-w-[720px] flex-col">
              <div className="flex border-b border-stroke2 py-2.5 text-[13px] font-medium text-nav/80">
                <p style={col(220)}>Excel column</p>
                <p style={col(260)}>Sample values</p>
                <p style={col(260)}>Save as</p>
              </div>
              {imp.headers.map((h, i) => {
                const samples = imp.preview.map((r) => cellText(r.cells[i])).filter(Boolean).slice(0, 3);
                return (
                  <div key={i} className="flex items-center gap-3 border-b border-stroke2 py-2">
                    <p className="text-[14px] font-semibold break-words text-black" style={col(220)}>
                      <span className="mr-2 text-[12px] font-medium text-nav">{letter(i)}</span>
                      {h}
                    </p>
                    <p className="truncate text-[13px] text-nav" style={col(260)} title={samples.join(" · ")}>
                      {samples.join(" · ") || "(empty)"}
                    </p>
                    <div className="flex flex-col gap-1" style={col(260)}>
                      <SelectField value={mapping[i]!} options={targets} onChange={(t) => setMapping((m) => m.map((x, j) => (j === i ? t : x)))} invalid={twice.has(mapping[i]!)} />
                      {twice.has(mapping[i]!) && <span className="text-[12px] text-danger">Another column is also saved as {label(mapping[i]!)}.</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {fields.data && missing.length > 0 && (
          <p className="text-[13px] text-nav">
            Not in this file (left empty, or unchanged when updating): {missing.map((f) => f.header).join(", ")}
          </p>
        )}
      </section>

      <section className={card}>
        <h2 className={h2}>How to import</h2>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[14px] font-medium text-black">Mode</legend>
          {(
            [
              ["add", "Add new shipments", "Rows whose shipment is already in the CRM are not imported (reported as duplicates)."],
              ["update", "Update existing shipments", "Rows matching a shipment change it (you see every change before importing); others are added. Empty cells never clear a value."],
            ] as const
          ).map(([value, title, hint]) => (
            <label key={value} className="flex cursor-pointer items-start gap-2.5 text-[14px]">
              <input suppressHydrationWarning type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="mt-0.5 size-4 cursor-pointer accent-button" />
              <span className="flex flex-col">
                <span className="font-medium text-black">{title}</span>
                <span className="text-[13px] text-nav">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <label className="flex w-full flex-col gap-1.5 sm:w-[320px]">
          <span className="text-[14px] font-medium text-black">Match shipments by</span>
          <SelectField value={key} options={keys.map((k) => ({ value: k, label: label(k) }))} onChange={setMatchKey} placeholder="Save an AWB column first" />
          <span className="text-[13px] text-nav">The column that is unique per shipment. A file row and a CRM shipment with the same value are the same shipment.</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2.5 text-[14px] text-black">
          <input suppressHydrationWarning type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-4 cursor-pointer accent-button" />
          Remember this mapping for files with the same columns
        </label>
        {error && (
          <p role="alert" className="text-[14px] text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <button suppressHydrationWarning type="button" onClick={check} disabled={!!busy || !fields.data} className={primary}>
            {busy === "check" && <Spinner />}
            {busy === "check" ? `Checking ${n(imp.rowCount)} rows…` : "Check data"}
          </button>
        </div>
      </section>

      <section className={card}>
        <h2 className={h2}>Preview (first {imp.preview.length} rows)</h2>
        <div className="table-scroll">
          <table className="w-max min-w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-stroke2 align-bottom text-nav/80">
                <th className="sticky left-0 bg-primary py-2 pr-3 font-medium">Row</th>
                {imp.headers.map((h, i) => (
                  <th key={i} className="max-w-[220px] py-2 pr-4 font-medium">
                    <span className="block text-black">{h}</span>
                    <span className={`block text-[12px] ${mapping[i] === "skip" ? "text-danger" : "text-selected"}`}>→ {fields.data ? label(mapping[i]!) : "…"}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {imp.preview.map((r) => (
                <tr key={r.rowNumber} className="border-b border-stroke2">
                  <td className="sticky left-0 bg-primary py-2 pr-3 font-semibold text-nav">{r.rowNumber}</td>
                  {imp.headers.map((_, i) => (
                    <td key={i} className={`max-w-[220px] py-2 pr-4 break-words text-black ${mapping[i] === "skip" ? "opacity-40" : ""}`}>
                      {cellText(r.cells[i])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

/* ---------- 3. Check ---------- */

const VIEWS = [
  ["problems", "Problems"],
  ["update", "Will update"],
  ["create", "Will add"],
  ["all", "All rows"],
] as const;
const CATEGORY: Record<string, [string, StatusTone]> = {
  valid: ["Ready", "green"],
  attention: ["Needs attention", "amber"],
  duplicate: ["Duplicate", "red"],
  invalid: ["Error", "red"],
};

function Tile({ label, value, tone = "" }: { label: string; value: number | undefined; tone?: string }) {
  return (
    <div className="flex min-w-[120px] flex-1 flex-col gap-0.5 rounded-[12px] border border-stroke2 px-3.5 py-2.5">
      <span className="text-[13px] font-medium text-nav">{label}</span>
      <span className={`text-[20px] font-semibold ${tone || "text-black"}`}>{n(value)}</span>
    </div>
  );
}

function RowsList({ id, initial }: { id: string; initial: (typeof VIEWS)[number][0] }) {
  const [view, setView] = useState<string>(initial);
  const [page, setPage] = useState(1);
  const rows = useApi<List<CheckedRow>>(`/operations/imports/${id}/rows`, { view, page, pageSize: 20 });
  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" className="flex flex-wrap gap-1.5">
        {VIEWS.map(([v, l]) => (
          <button
            suppressHydrationWarning
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => (setView(v), setPage(1))}
            className={`h-9 cursor-pointer rounded-[10px] px-3 text-[14px] font-medium transition-colors ${view === v ? "bg-button text-white" : "border border-stroke2 bg-bg5 text-nav hover:bg-[rgb(71_215_251/0.2)]"}`}
          >
            {l}
          </button>
        ))}
      </div>
      {!rows.data && !rows.error && <SkeletonLines rows={4} />}
      {!rows.data && rows.error && <LoadFailed what="the rows" onRetry={rows.reload} />}
      {rows.data?.items.length === 0 && <EmptyState>No rows here.</EmptyState>}
      {rows.data && rows.data.items.length > 0 && (
        <ul className="flex flex-col divide-y divide-stroke2 border-y border-stroke2">
          {rows.data.items.map((r) => {
            const [cat, tone] = CATEGORY[r.category ?? ""] ?? ["—", "slate"];
            return (
              <li key={r.rowNumber} className="flex flex-col gap-1.5 py-2.5 text-[14px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-black">Row {r.rowNumber}</span>
                  <Badge label={cat} tone={tone} />
                  {r.action === "create" && <span className="text-[13px] text-nav">will be added</span>}
                  {r.action === "update" && <span className="text-[13px] text-nav">will update {r.changes.length} field{r.changes.length === 1 ? "" : "s"}</span>}
                  {r.action === "unchanged" && <span className="text-[13px] text-nav">already up to date</span>}
                  <span className="min-w-0 truncate text-[13px] text-nav">{r.cells.slice(0, 6).map((c) => cellText(c)).filter(Boolean).join(" · ")}</span>
                </div>
                {r.problems.length > 0 && (
                  <ul className="flex flex-col gap-0.5 pl-1">
                    {r.problems.map((p, i) => (
                      <li key={i} className={`flex gap-1.5 text-[13px] ${p.level === "attention" ? "text-black" : "text-danger"}`}>
                        <Icon name="warning" size={16} className={`shrink-0 ${p.level === "attention" ? "text-warn" : "text-danger"}`} />
                        {p.message}
                      </li>
                    ))}
                  </ul>
                )}
                {r.changes.length > 0 && (
                  <ul className="flex flex-col gap-0.5 pl-1 text-[13px]">
                    {r.changes.map((c) => (
                      <li key={c.field} className="break-words text-black">
                        <span className="font-medium">{c.label}:</span> <span className="text-nav line-through">{c.from ?? "(empty)"}</span> → <span className="font-medium text-selected">{c.to ?? "(empty)"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {rows.data && <Pagination {...paging(rows.data, "Rows", setPage)} />}
    </div>
  );
}

function CheckStep({ imp, onBack, onImported, onCancelled }: { imp: ImportView; onBack: () => void; onImported: (v: ImportView) => void; onCancelled: () => void }) {
  const t = imp.totals;
  const [includeAttention, setIncludeAttention] = useState(true);
  const [busy, setBusy] = useState<"import" | "report" | "cancel" | null>(null);
  const toast = useToast();
  const confirm = useConfirm();
  const problems = (t.attention ?? 0) + (t.duplicate ?? 0) + (t.invalid ?? 0);
  const writes = (t.create ?? 0) + (t.update ?? 0) - (includeAttention ? 0 : (t.attentionWrites ?? 0));
  const newValues = Object.entries(t.newValues ?? {});
  const fields = useApi<Fields>("/operations/fields", undefined, 0, { keep: true });
  const headerOf = (key: string) => fields.data?.fields.find((f) => f.key === key)?.header ?? key;

  const run = async () => {
    if (
      t.update &&
      !(await confirm({
        title: "Update existing shipments?",
        message: `Up to ${n(t.update)} shipments already in the CRM will be changed as listed under “Will update” (${n(t.changes)} values in all). Nothing is deleted, and the original Excel row is kept with each shipment.`,
        confirmLabel: "Import and update",
      }))
    )
      return;
    setBusy("import");
    try {
      const done = await api<ImportView>(`/operations/imports/${imp.id}/commit`, { method: "POST", body: { includeAttention } });
      toast.success("Import complete", `${n(done.totals.created)} added, ${n(done.totals.updated)} updated`);
      onImported(done);
    } catch (err) {
      toast.apiError(err, "Couldn't import the file");
    } finally {
      setBusy(null);
    }
  };
  const report = async () => {
    setBusy("report");
    try {
      toast.success("Error report downloaded", await download(`/operations/imports/${imp.id}/report`));
    } catch (err) {
      toast.apiError(err, "Couldn't download the error report");
    } finally {
      setBusy(null);
    }
  };
  const cancel = async () => {
    setBusy("cancel");
    try {
      await api(`/operations/imports/${imp.id}/cancel`, { method: "POST" });
      onCancelled();
    } catch (err) {
      toast.apiError(err, "Couldn't cancel the upload");
      setBusy(null);
    }
  };

  return (
    <>
      <section className={card}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className={`${h2} break-all`}>Check: {imp.fileName}</h2>
            <p className="text-[14px] text-nav">
              {imp.mode === "update" ? "Update existing shipments" : "Add new shipments"} · matched by {imp.matchKey === "awbNumber" ? "AWB Number" : imp.matchKey === "awbNo" ? "AWB No." : "Forwarding No."} · nothing has been imported yet
            </p>
          </div>
          <button suppressHydrationWarning type="button" onClick={onBack} disabled={!!busy} className={secondary}>
            Change mapping or mode
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Tile label="Rows in the file" value={t.rows} />
          <Tile label="Ready" value={t.valid} tone="text-success" />
          <Tile label="Need attention" value={t.attention} tone={t.attention ? "text-warn" : ""} />
          <Tile label="Duplicates" value={t.duplicate} tone={t.duplicate ? "text-danger" : ""} />
          <Tile label="Errors" value={t.invalid} tone={t.invalid ? "text-danger" : ""} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Tile label="Will be added" value={t.create} />
          <Tile label="Will be updated" value={t.update} />
          <Tile label="Already up to date" value={t.unchanged} />
        </div>
        <p className="text-[13px] text-nav">Rows with errors or duplicates are never imported. Rows that need attention can be: they are valid, but something is new or could not be linked (see Problems).</p>
        {newValues.length > 0 && (
          <div className="flex flex-col gap-1 rounded-[12px] border border-warn/40 bg-warn/10 px-3.5 py-2.5 text-[14px] text-black">
            <span className="font-semibold">New values not yet used in the CRM</span>
            {newValues.map(([field, values]) => (
              <span key={field} className="break-words">
                <span className="font-medium">{headerOf(field)}:</span>{" "}
                {Object.entries(values)
                  .map(([v, c]) => `${v} (${n(c)} row${c === 1 ? "" : "s"})`)
                  .join(", ")}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className={card}>
        <h2 className={h2}>Rows</h2>
        <RowsList id={imp.id} initial={problems ? "problems" : t.update ? "update" : "all"} />
      </section>

      <section className={card}>
        {(t.attentionWrites ?? 0) > 0 && (
          <label className="flex cursor-pointer items-start gap-2.5 text-[14px] text-black">
            <input suppressHydrationWarning type="checkbox" checked={includeAttention} onChange={(e) => setIncludeAttention(e.target.checked)} className="mt-0.5 size-4 cursor-pointer accent-button" />
            <span>
              Also import the {n(t.attentionWrites)} rows that need attention
              <span className="block text-[13px] text-nav">Untick to import only the rows that are ready; the others stay in the error report.</span>
            </span>
          </label>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button suppressHydrationWarning type="button" onClick={cancel} disabled={!!busy} className={secondary}>
            {busy === "cancel" && <Spinner />}
            Cancel upload
          </button>
          {problems > 0 && (
            <button suppressHydrationWarning type="button" onClick={report} disabled={!!busy} className={secondary}>
              {busy === "report" ? <Spinner /> : <Icon name="download" size={16} />}
              Download Error Report
            </button>
          )}
          <button suppressHydrationWarning type="button" onClick={run} disabled={!!busy || writes <= 0} className={primary}>
            {busy === "import" && <Spinner />}
            {busy === "import" ? "Importing…" : writes > 0 ? `Import ${n(writes)} row${writes === 1 ? "" : "s"}` : "Nothing to import"}
          </button>
        </div>
      </section>
    </>
  );
}

/* ---------- 4. Done ---------- */

function DoneStep({ imp, onAnother }: { imp: ImportView; onAnother: () => void }) {
  const t = imp.totals;
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const notImported = (t.invalid ?? 0) + (t.duplicate ?? 0) + (t.skipped ?? 0);
  const report = async () => {
    setBusy(true);
    try {
      toast.success("Error report downloaded", await download(`/operations/imports/${imp.id}/report`));
    } catch (err) {
      toast.apiError(err, "Couldn't download the error report");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={card}>
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-success/15 text-[20px] text-success">✓</span>
        <div className="flex min-w-0 flex-col">
          <h2 className={`${h2} break-all`}>Imported {imp.fileName}</h2>
          <p className="text-[14px] text-nav">
            {imp.importedAt && dateTime(imp.importedAt)} · {imp.mode === "update" ? "update mode" : "add mode"}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Tile label="Rows in the file" value={t.rows} />
        <Tile label="Added" value={t.created} tone="text-success" />
        <Tile label="Updated" value={t.updated} tone="text-success" />
        <Tile label="Already up to date" value={t.unchanged} />
        <Tile label="Not imported" value={notImported} tone={notImported ? "text-danger" : ""} />
      </div>
      {notImported > 0 && (
        <p className="text-[14px] text-black">
          {n(t.invalid)} with errors, {n(t.duplicate)} duplicates{t.skipped ? `, ${n(t.skipped)} needing attention left out` : ""}. The error report lists each with the reason and its original cells; fix them in Excel and upload the corrected file.
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {notImported + (t.attention ?? 0) > 0 && (
          <button suppressHydrationWarning type="button" onClick={report} disabled={busy} className={secondary}>
            {busy ? <Spinner /> : <Icon name="download" size={16} />}
            Download Error Report
          </button>
        )}
        <button suppressHydrationWarning type="button" onClick={onAnother} className={secondary}>
          Upload Another File
        </button>
        <Link href={`/operations?importId=${imp.id}`} className={primary}>
          View Imported Shipments
        </Link>
      </div>
    </section>
  );
}
