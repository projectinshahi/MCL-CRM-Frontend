"use client";

import { DateField, Field, IconButton, SelectField, TextInput } from "@/components/ui";
import { CONTENTS, SCOPES, type CardDetails, type Charge } from "@/lib/rates";
import { checkbox } from "./RatesFrame";

/** A rate card's details: who it's for, when it applies, and the charges on top of its prices. */
export function CardDetailsForm({ value, onChange, accounts, errors, couriers }: {
  value: CardDetails;
  onChange: (v: CardDetails) => void;
  accounts: { id: string; name: string }[];
  errors: Record<string, string>;
  couriers?: { id: string; name: string }[]; // given: the card's courier can be changed here (its account is then reset)
}) {
  const set = <K extends keyof CardDetails>(k: K) => (v: CardDetails[K]) => onChange({ ...value, [k]: v });
  const setCharge = (i: number, c: Partial<Charge>) => set("charges")(value.charges.map((x, j) => (j === i ? { ...x, ...c } : x)));
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Rate card name" error={errors.name} required>
          <TextInput value={value.name} onChange={(e) => set("name")(e.target.value)} aria-invalid={!!errors.name || undefined} placeholder="e.g. FedEx IP Package – Cochin" />
        </Field>
        {couriers && (
          <Field label="Courier" error={errors.courierId} required>
            <div>
              <SelectField value={value.courierId} options={couriers.map((c) => ({ value: c.id, label: c.name }))} onChange={(v) => v !== value.courierId && onChange({ ...value, courierId: v, accountId: null })} />
            </div>
          </Field>
        )}
        <Field label="Account" error={errors.accountId}>
          <div>
            <SelectField value={value.accountId ?? ""} options={[{ value: "", label: "General rates (no account)" }, ...accounts.map((a) => ({ value: a.id, label: a.name }))]} onChange={(v) => set("accountId")(v || null)} />
          </div>
        </Field>
        <Field label="Domestic or international">
          <div>
            <SelectField value={value.scope} options={SCOPES} onChange={(v) => set("scope")(v as CardDetails["scope"])} />
          </div>
        </Field>
        <Field label="Service" error={errors.service}>
          <TextInput value={value.service} onChange={(e) => set("service")(e.target.value)} placeholder="e.g. International Priority" />
        </Field>
        <Field label="Shipment contents">
          <div>
            <SelectField value={value.contents} options={CONTENTS} onChange={(v) => set("contents")(v as CardDetails["contents"])} />
          </div>
        </Field>
        <Field label="Origin" error={errors.origin}>
          <TextInput value={value.origin} onChange={(e) => set("origin")(e.target.value)} placeholder="e.g. Kochi (empty: any)" />
        </Field>
        <Field label="Effective from" error={errors.effectiveFrom} required>
          <div>
            <DateField value={value.effectiveFrom} onChange={set("effectiveFrom")} invalid={!!errors.effectiveFrom} />
          </div>
        </Field>
        <Field label="Expires after" error={errors.effectiveTo}>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <DateField value={value.effectiveTo ?? ""} onChange={(v) => set("effectiveTo")(v || null)} min={value.effectiveFrom || undefined} invalid={!!errors.effectiveTo} />
            </div>
            {value.effectiveTo && <IconButton icon="close" label="No expiry date" onClick={() => set("effectiveTo")(null)} />}
          </div>
        </Field>
        <Field label="Currency" error={errors.currency}>
          <TextInput value={value.currency} onChange={(e) => set("currency")(e.target.value.toUpperCase())} maxLength={3} />
        </Field>
        <Field label="Fuel surcharge %" error={errors.fuelPercent}>
          <TextInput value={value.fuelPercent ?? ""} onChange={(e) => set("fuelPercent")(e.target.value || null)} inputMode="decimal" placeholder="Not on this card" />
        </Field>
        <Field label="GST %" error={errors.gstPercent}>
          <TextInput value={value.gstPercent ?? ""} onChange={(e) => set("gstPercent")(e.target.value || null)} inputMode="decimal" placeholder={value.gstIncluded ? "Included in the prices" : "e.g. 18"} disabled={value.gstIncluded} />
        </Field>
        <div className="flex flex-col justify-end gap-2 pb-2">
          <label className="flex cursor-pointer items-center gap-2.5 text-[14px] text-black">
            <input suppressHydrationWarning type="checkbox" checked={value.gstIncluded} onChange={(e) => onChange({ ...value, gstIncluded: e.target.checked, gstPercent: e.target.checked ? null : value.gstPercent })} className={checkbox} />
            The prices include GST
          </label>
          <label className="flex cursor-pointer items-center gap-2.5 text-[14px] text-black">
            <input suppressHydrationWarning type="checkbox" checked={value.active} onChange={(e) => set("active")(e.target.checked)} className={checkbox} />
            Active (used by the calculator)
          </label>
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-[14px] font-medium text-black">Other charges</legend>
        {value.charges.length === 0 && <p className="text-[13px] text-nav">None. Add the card&apos;s other charges (e.g. a docket charge, or a % on the freight).</p>}
        {value.charges.map((c, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <TextInput value={c.label} onChange={(e) => setCharge(i, { label: e.target.value })} placeholder="Charge name" aria-label="Charge name" className="w-full! sm:w-[260px]!" />
            <div className="w-[170px]">
              <SelectField value={c.type} options={[{ value: "fixed", label: "Fixed amount" }, { value: "percent", label: "% of freight" }]} onChange={(v) => setCharge(i, { type: v as Charge["type"] })} />
            </div>
            <TextInput value={c.value} onChange={(e) => setCharge(i, { value: e.target.value })} inputMode="decimal" placeholder={c.type === "fixed" ? "Amount" : "%"} aria-label="Charge value" className="w-[120px]!" />
            <IconButton icon="delete" label={`Remove ${c.label || "charge"}`} onClick={() => set("charges")(value.charges.filter((_, j) => j !== i))} />
          </div>
        ))}
        {Object.entries(errors).filter(([k]) => k.startsWith("charges")).map(([k, m]) => (
          <p key={k} className="text-[13px] text-danger">{m}</p>
        ))}
        <button suppressHydrationWarning type="button" onClick={() => set("charges")([...value.charges, { label: "", type: "fixed", value: "" }])} className="cursor-pointer self-start text-[14px] font-semibold text-link">
          + Add a charge
        </button>
      </fieldset>
    </div>
  );
}
