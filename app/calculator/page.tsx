"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useMe } from "@/components/Shell";
import { useToast } from "@/components/feedback";
import { Icon } from "@/components/Icon";
import { SkeletonLines } from "@/components/skeletons";
import { IconButton, LoadFailed, PageHeader, SelectField, Spinner } from "@/components/ui";
import { api, day, useApi, useDebounced } from "@/lib/api";
import { money, type CalcOptions, type Quote, type QuoteResult } from "@/lib/rates";

// The DTDC Calculator: prices a shipment from the rate cards administrators upload in Settings → Courier Rate
// Management. Nothing here is a price of its own: with no matching card, it says so.

type Doc = "DOX" | "NDOX";
const DOCS: Doc[] = ["DOX", "NDOX"];
type Recent = { at: string; doc: Doc; destination: string; weight: string; result: string };

const label = "text-[13px] font-medium text-black opacity-70";
const input =
  "h-10 w-full rounded-[12px] border border-stroke2 bg-bg5 px-3.5 text-[14px] font-medium text-nav outline-none transition-[border-color,box-shadow] placeholder:text-nav/60 focus:border-stroke focus:shadow-[0_0_0_3px_rgb(71_215_251/0.25)]";
const section = "flex min-w-0 flex-col gap-3 rounded-[16px] border border-stroke2 bg-primary p-4 sm:p-5";
const h2 = "text-[18px] font-semibold tracking-[-0.36px] text-black";

function Row({ k, children, strong = false }: { k: ReactNode; children: ReactNode; strong?: boolean }) {
  return (
    <div className={`flex flex-col gap-0.5 border-b border-stroke2 py-2.5 last:border-b-0 sm:flex-row sm:items-start sm:gap-6 ${strong ? "font-semibold" : ""}`}>
      <p className="text-[14px] text-black/80 sm:basis-[220px] sm:shrink-0">{k}</p>
      <div className="min-w-0 text-[14px] break-words text-black">{children}</div>
    </div>
  );
}

export default function CalculatorPage() {
  const options = useApi<CalcOptions>("/calculator/options");
  const canManage = !!useMe()?.permissions.includes("settings");
  const toast = useToast();
  const [courierId, setCourierId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [origin, setOrigin] = useState("");
  const [doc, setDoc] = useState<Doc>("NDOX");
  const [destination, setDestination] = useState("");
  const [weight, setWeight] = useState("");
  const [dims, setDims] = useState<{ lengthCm: string; widthCm: string; heightCm: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QuoteResult | null>(null);
  const [picked, setPicked] = useState(0);
  const [error, setError] = useState<string>();
  const [recent, setRecent] = useState<Recent[]>([]);
  // The destinations the chosen courier, account and DOX/NDOX have rates for: picked from a list, searchable
  const [destSearch, setDestSearch] = useState("");
  const destQ = useDebounced(destSearch.trim(), 250);
  const destinations = useApi<{ items: string[]; more: boolean }>("/calculator/destinations", { q: destQ, courierId: courierId || undefined, accountId: accountId || undefined, contents: doc === "DOX" ? "document" : "non_document" }, 0, { keep: true });
  // Narrowed as it is typed (the server's answer, for destinations beyond the list, follows)
  const typed = destSearch.trim().toLowerCase();
  const destItems = (destinations.data?.items ?? []).filter((n) => n.toLowerCase().includes(typed));
  // This courier, account and DOX/NDOX have no rates in force at all: said at once, not only after Calculate
  const noRates = !!destinations.data && !destinations.loading && !destQ && destinations.data.items.length === 0;
  const courier = options.data?.couriers.find((c) => c.id === courierId);

  const calculate = async () => {
    if (busy) return;
    setError(undefined);
    if (!destination.trim()) return setError("Choose the destination.");
    if (!(Number(weight) > 0)) return setError("Enter the weight in kg.");
    setBusy(true);
    try {
      const r = await api<QuoteResult>("/calculator/quote", {
        method: "POST",
        body: { courierId: courierId || null, accountId: accountId || null, origin, destination: destination.trim(), contents: doc === "DOX" ? "document" : "non_document", weightKg: weight.trim(), dimensions: dims && dims.lengthCm && dims.widthCm && dims.heightCm ? dims : null },
      });
      setResult(r);
      setPicked(0);
      const best = r.quotes[0];
      setRecent((list) => [{ at: new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }), doc, destination: destination.trim(), weight, result: best ? `${best.courier.name}: ${money(best.total, best.card.currency)}` : "No rate configured" }, ...list].slice(0, 10));
    } catch (err) {
      toast.apiError(err, "Couldn't calculate the rate");
    } finally {
      setBusy(false);
    }
  };

  const quote: Quote | undefined = result?.quotes[picked];
  const extraLines = [...new Set(result?.quotes.flatMap((x) => x.lines.map((l) => l.label)) ?? [])];

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <PageHeader title="Rate Calculator" subtitle="Prices from the courier rate cards in Settings → Courier Rate Management" />

      <section className={section}>
        {!options.data && !options.error && <SkeletonLines rows={2} />}
        {!options.data && options.error && <LoadFailed what="the couriers" onRetry={options.reload} />}
        {options.data && options.data.couriers.length === 0 && (
          <p className="rounded-[12px] border border-warn/40 bg-warn/10 px-3.5 py-2.5 text-[14px] text-black">
            No courier rates are in force yet.{" "}
            {canManage ? (
              <Link href="/settings/courier-rates/upload" className="font-semibold text-link">Upload a courier rate Excel</Link>
            ) : (
              "Ask an administrator to upload the courier rate cards in Settings."
            )}
          </p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-2">
            <span className={label}>Courier</span>
            <SelectField value={courierId} options={[{ value: "", label: "All couriers (compare)" }, ...(options.data?.couriers.map((c) => ({ value: c.id, label: c.name })) ?? [])]} onChange={(v) => (setCourierId(v), setAccountId(""))} />
          </label>
          <label className="flex flex-col gap-2">
            <span className={label}>Account</span>
            <SelectField value={accountId} options={[{ value: "", label: "General rates (no account)" }, ...(courier?.accounts.map((a) => ({ value: a.id, label: a.name })) ?? [])]} onChange={setAccountId} />
          </label>
          {options.data && options.data.origins.length > 0 && (
            <label className="flex flex-col gap-2">
              <span className={label}>Origin</span>
              <SelectField value={origin} options={[{ value: "", label: "Any origin" }, ...options.data.origins]} onChange={setOrigin} />
            </label>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-2">
            <p className={label}>DOX / NDOX</p>
            <div className="relative flex w-fit gap-1 rounded-[12px] border border-stroke2 bg-bg5 p-[3px]">
              <span aria-hidden className={`absolute top-[3px] bottom-[3px] left-[3px] w-[100px] rounded-[9px] bg-button transition-transform ${doc === "NDOX" ? "translate-x-[104px]" : ""}`} />
              {DOCS.map((d) => (
                <button suppressHydrationWarning key={d} type="button" aria-pressed={doc === d} onClick={() => setDoc(d)} className={`relative h-8 w-[100px] cursor-pointer rounded-[9px] text-[14px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${doc === d ? "text-white" : "text-black"}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>
          <label className="flex min-w-[240px] flex-1 flex-col gap-2">
            <span className={label}>Destination</span>
            <SelectField
              value={destination}
              options={destination && !destItems.includes(destination) && destination.toLowerCase().includes(typed) ? [destination, ...destItems] : destItems}
              onChange={(v) => (setDestination(v), setDestSearch(""))}
              placeholder={destinations.data && !destinations.data.items.length && !destQ ? "No destinations with rates for this choice" : "Choose the destination"}
              search={destSearch}
              onSearch={setDestSearch}
            />
          </label>
          <label className="flex w-[160px] flex-col gap-2">
            <span className={label}>Actual weight (kg)</span>
            <input suppressHydrationWarning value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal" placeholder="e.g. 1.5" className={input} onKeyDown={(e) => e.key === "Enter" && calculate()} />
          </label>
          {dims &&
            (["lengthCm", "widthCm", "heightCm"] as const).map((k) => (
              <label key={k} className="flex w-[110px] flex-col gap-2">
                <span className={label}>{k === "lengthCm" ? "Length" : k === "widthCm" ? "Width" : "Height"} (cm)</span>
                <input suppressHydrationWarning value={dims[k]} onChange={(e) => setDims({ ...dims, [k]: e.target.value })} inputMode="decimal" className={input} />
              </label>
            ))}
          <button suppressHydrationWarning type="button" onClick={() => setDims(dims ? null : { lengthCm: "", widthCm: "", heightCm: "" })} className="h-10 cursor-pointer text-[14px] font-semibold text-link">
            {dims ? "No dimensions" : "+ Dimensions"}
          </button>
          <button suppressHydrationWarning type="button" onClick={calculate} disabled={busy} className="flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-[12px] bg-button px-4 text-[14px] font-medium whitespace-nowrap text-white transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-wait disabled:opacity-80">
            {busy && <Spinner />}
            Calculate Rates
          </button>
        </div>
        {noRates && (
          <p role="status" className="rounded-[12px] border border-warn/40 bg-warn/10 px-3.5 py-2.5 text-[14px] text-black">
            No rate configured for {courier ? courier.name : "any courier"}
            {accountId ? `, account ${courier?.accounts.find((a) => a.id === accountId)?.name ?? ""}` : " (general rates)"} and {doc === "DOX" ? "documents" : "parcels"}. Choose another courier or account
            {canManage ? (
              <>
                , or <Link href="/settings/courier-rates/upload" className="font-semibold text-link">upload its rate card</Link>
              </>
            ) : null}
            .
          </p>
        )}
        {error && <p role="alert" className="text-[14px] text-danger">{error}</p>}
      </section>

      {result && !quote && (
        <section role="alert" className={`${section} border-danger/40`}>
          <h2 className="flex items-center gap-2 text-[18px] font-semibold text-danger">
            <Icon name="warning" size={20} />
            {result.message}
          </h2>
          {result.unmatched.length > 0 ? (
            <ul className="flex flex-col gap-1 text-[14px] text-black">
              {result.unmatched.map((u, i) => (
                <li key={i}>
                  <b>{u.courier}</b> · {u.card}: {u.reason}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-black">No rate card in force fits this courier, account{origin ? ", origin" : ""} and {doc === "DOX" ? "document" : "parcel"} shipment.</p>
          )}
        </section>
      )}

      {result && quote && (
        <>
          <section className={section}>
            <h2 className={h2}>Courier Rate Comparison</h2>
            <div className="table-scroll">
              <table className="w-max min-w-full border-collapse text-[14px]">
                <thead>
                  <tr className="border-b border-stroke2 text-left">
                    <th className="py-2.5 pr-6 text-[13px] font-semibold text-black/80">Rate details</th>
                    {result.quotes.map((x, i) => (
                      <th key={x.card.id} className="py-2 pr-6 align-bottom">
                        <button suppressHydrationWarning type="button" aria-pressed={i === picked} onClick={() => setPicked(i)} className={`cursor-pointer rounded-[10px] px-2.5 py-1.5 text-left ${i === picked ? "bg-[rgb(71_215_251/0.18)] text-selected" : "text-black hover:bg-bg5"}`}>
                          <span className="block font-semibold">{x.courier.name}</span>
                          <span className="block text-[12px] font-normal text-nav">{[x.card.service, x.account?.name].filter(Boolean).join(" · ") || x.card.name}</span>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-stroke2">
                    <td className="py-2.5 pr-6">Zone</td>
                    {result.quotes.map((x) => <td key={x.card.id} className="py-2.5 pr-6">{x.zone}</td>)}
                  </tr>
                  <tr className="border-b border-stroke2">
                    <td className="py-2.5 pr-6">Chargeable weight</td>
                    {result.quotes.map((x) => <td key={x.card.id} className="py-2.5 pr-6">{Number(x.weight.chargeableKg)} kg</td>)}
                  </tr>
                  {extraLines.map((l) => (
                    <tr key={l} className="border-b border-stroke2">
                      <td className="py-2.5 pr-6">{l}</td>
                      {result.quotes.map((x) => {
                        const line = x.lines.find((y) => y.label === l);
                        return (
                          <td key={x.card.id} className="py-2.5 pr-6">
                            {line ? (line.rate === "included in the rates" ? "Included" : `${money(line.amount, x.card.currency)}${line.rate ? ` (${line.rate})` : ""}`) : "–"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="font-semibold uppercase">
                    <td className="py-3 pr-6">Total</td>
                    {result.quotes.map((x) => <td key={x.card.id} className="py-3 pr-6">{money(x.total, x.card.currency)}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
            {result.unmatched.length > 0 && <p className="text-[13px] text-nav">Not priced: {result.unmatched.map((u) => `${u.courier} (${u.card}): ${u.reason}`).join(" · ")}</p>}
          </section>

          <div className="flex flex-col gap-4 min-[1400px]:flex-row">
            <section className={`${section} flex-1`}>
              <h2 className={h2}>Calculation Breakdown · {quote.courier.name}</h2>
              <div className="flex flex-col">
                <Row k="Actual weight">{Number(quote.weight.actualKg)} kg</Row>
                {quote.weight.volumetricKg && <Row k="Dimensional weight">{Number(quote.weight.volumetricKg)} kg</Row>}
                <Row k="Chargeable weight">
                  {Number(quote.weight.chargeableKg)} kg
                  {quote.weight.notes.map((n) => (
                    <span key={n} className="block text-[13px] text-nav">{n}</span>
                  ))}
                </Row>
                <Row k="Zone">
                  {quote.zone} <span className="text-[13px] text-nav">({quote.zoneFound})</span>
                </Row>
                <Row k="Rate used">
                  {quote.freight.basis} <span className="text-[13px] text-nav">({quote.freight.cell})</span>
                </Row>
                {quote.lines.map((l) => (
                  <Row key={l.label} k={`${l.label}${l.rate ? ` (${l.rate})` : ""}`}>{l.rate === "included in the rates" ? "Included in the rates" : money(l.amount, quote.card.currency)}</Row>
                ))}
                <Row k="Total" strong>{money(quote.total, quote.card.currency)}</Row>
              </div>
            </section>
            <section className={`${section} flex-1`}>
              <h2 className={h2}>Reference Information</h2>
              <div className="flex flex-col rounded-[14px] bg-[rgb(71_215_251/0.16)] px-4">
                <Row k="Rate card">{quote.card.name}</Row>
                <Row k="Courier / account">{quote.courier.name} · {quote.account?.name ?? "general rates"}</Row>
                <Row k="In force">{day(quote.card.effectiveFrom)} – {quote.card.effectiveTo ? day(quote.card.effectiveTo) : "no expiry"}</Row>
                {quote.card.origin && <Row k="Origin">{quote.card.origin}</Row>}
                {quote.card.file && <Row k="Uploaded from">{quote.card.file}</Row>}
                <Row k="Weight rule">
                  {quote.weightRule
                    ? [quote.weightRule.useVolumetric && quote.weightRule.divisor ? `L × W × H ÷ ${quote.weightRule.divisor}` : "actual weight", quote.weightRule.minChargeableKg && `min ${Number(quote.weightRule.minChargeableKg)} kg`, quote.weightRule.steps.length ? `rounded up by ${quote.weightRule.steps.map((s) => `${s.stepKg} kg${s.upToKg ? ` to ${s.upToKg} kg` : ""}`).join(", then ")}` : null].filter(Boolean).join("; ")
                    : "none set: weight charged as entered"}
                </Row>
              </div>
            </section>
          </div>
        </>
      )}

      {recent.length > 0 && (
        <section className={section}>
          <h2 className={h2}>Recent Calculations</h2>
          <ul className="flex flex-col divide-y divide-stroke2">
            {recent.map((r, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[14px] text-black">
                <span>
                  <span className="text-nav">{r.at}</span> · {r.doc} · {r.destination} · {r.weight} kg · <b>{r.result}</b>
                </span>
                <IconButton icon="delete" label="Remove from the list" onClick={() => setRecent((list) => list.filter((_, j) => j !== i))} />
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-muted">Kept on this page only, until it is closed.</p>
        </section>
      )}
    </div>
  );
}
