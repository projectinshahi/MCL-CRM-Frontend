"use client";

import { useState } from "react";
import { useConfirm, useToast } from "@/components/feedback";
import { card, checkbox, h2, RatesFrame, secondary } from "@/components/rates/RatesFrame";
import { SkeletonLines } from "@/components/skeletons";
import { EmptyState, Field, IconButton, LoadFailed, Modal, ModalActions, TextInput } from "@/components/ui";
import { api, fieldErrors, useApi } from "@/lib/api";
import type { Courier, WeightRule } from "@/lib/rates";

// How each courier works out the weight it charges for: dimensional weight (L × W × H ÷ divisor), a minimum, and
// rounding up by weight band (e.g. to the next 0.5 kg up to 20 kg, then to the next 1 kg). Per courier, or per service.
type Form = { service: string; useVolumetric: boolean; divisor: string; minChargeableKg: string; steps: { upToKg: string; stepKg: string }[] };
const EMPTY: Form = { service: "", useVolumetric: true, divisor: "5000", minChargeableKg: "", steps: [{ upToKg: "20", stepKg: "0.5" }, { upToKg: "", stepKg: "1" }] };

/** What a rule does to a few weights, worked out here only to show it (the API applies the rule). */
function example(f: Form) {
  const steps = f.steps.map((s) => ({ upTo: s.upToKg ? Number(s.upToKg) : null, step: Number(s.stepKg) })).filter((s) => s.step > 0);
  const round = (w: number) => {
    const min = Number(f.minChargeableKg) || 0;
    const x = Math.max(w, min);
    const band = steps.find((s) => s.upTo === null || x <= s.upTo);
    return band ? Math.round(Math.ceil(x / band.step - 1e-9) * band.step * 1000) / 1000 : x;
  };
  return [0.3, 1.2, 20.3].map((w) => `${w} kg → ${round(w)} kg`).join(" · ");
}
const ruleText = (r: WeightRule) =>
  [
    r.useVolumetric && r.divisor ? `dimensional weight = L × W × H (cm) ÷ ${r.divisor}, the greater of it and actual weight charged` : "actual weight only",
    r.minChargeableKg ? `at least ${Number(r.minChargeableKg)} kg` : null,
    r.steps.length ? `rounded up ${r.steps.map((s) => `to the next ${s.stepKg} kg ${s.upToKg === null ? "above that" : `up to ${s.upToKg} kg`}`).join(", ")}` : "not rounded",
  ]
    .filter(Boolean)
    .join("; ");

export default function WeightRulesPage() {
  const couriers = useApi<Courier[]>("/couriers");
  const [editing, setEditing] = useState<{ courier: Courier; rule: WeightRule | null } | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  const open = (courier: Courier, rule: WeightRule | null) => {
    setEditing({ courier, rule });
    setErrors({});
    setForm(
      rule
        ? { service: rule.service, useVolumetric: rule.useVolumetric, divisor: rule.divisor ? String(rule.divisor) : "", minChargeableKg: rule.minChargeableKg ?? "", steps: rule.steps.map((s) => ({ upToKg: s.upToKg === null ? "" : String(s.upToKg), stepKg: String(s.stepKg) })) }
        : EMPTY,
    );
  };
  const save = async () => {
    if (!editing || saving) return;
    if (!editing.rule && !form.service.trim() && editing.courier.weightRules.some((r) => r.service === ""))
      return setErrors({ service: "This courier already has a rule for all its services: enter the service this one is for." });
    setSaving(true);
    try {
      await api(`/couriers/${editing.courier.id}/weight-rules`, {
        method: "PUT",
        body: {
          service: form.service.trim(),
          useVolumetric: form.useVolumetric,
          divisor: form.divisor ? Number(form.divisor) : null,
          minChargeableKg: form.minChargeableKg || null,
          steps: form.steps.filter((s) => s.stepKg).map((s) => ({ upToKg: s.upToKg ? Number(s.upToKg) : null, stepKg: Number(s.stepKg) })),
        },
      });
      toast.success("Weight rule saved", `${editing.courier.name}${form.service ? ` · ${form.service}` : ""}`);
      setEditing(null);
      couriers.reload();
    } catch (err) {
      const f = fieldErrors(err);
      if (Object.keys(f).length) setErrors(f);
      else toast.apiError(err, "Couldn't save the weight rule");
    } finally {
      setSaving(false);
    }
  };
  const remove = async (c: Courier, r: WeightRule) => {
    if (!(await confirm({ title: "Remove weight rule?", message: `${c.name}${r.service ? ` · ${r.service}` : ""}: weights will be charged as entered until a rule is set again.`, confirmLabel: "Remove", danger: true }))) return;
    try {
      await api(`/weight-rules/${r.id}`, { method: "DELETE" });
      couriers.reload();
    } catch (err) {
      toast.apiError(err, "Couldn't remove the weight rule");
    }
  };
  const setStep = (i: number, k: "upToKg" | "stepKg", v: string) => setForm((f) => ({ ...f, steps: f.steps.map((s, j) => (j === i ? { ...s, [k]: v } : s)) }));

  return (
    <RatesFrame sub={2}>
      {!couriers.data && !couriers.error && <SkeletonLines rows={4} />}
      {!couriers.data && couriers.error && <LoadFailed what="couriers" onRetry={couriers.reload} />}
      {couriers.data?.length === 0 && (
        <section className={card}>
          <EmptyState>Add a courier under Couriers &amp; Accounts first.</EmptyState>
        </section>
      )}
      {couriers.data?.map((c) => (
        <section key={c.id} className={card}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className={h2}>{c.name}</h2>
            <button suppressHydrationWarning type="button" onClick={() => open(c, null)} className={secondary}>
              {c.weightRules.some((r) => r.service === "") ? "+ Rule for one service" : "+ Set weight rule"}
            </button>
          </div>
          {c.weightRules.length === 0 && <p className="text-[14px] text-nav">No weight rule: the calculator charges the weight as entered, and says so.</p>}
          {c.weightRules.map((r) => (
            <div key={r.id} className="flex items-start justify-between gap-3 border-t border-stroke2 pt-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[14px] font-semibold text-black">{r.service ? `Service: ${r.service}` : "All services"}</span>
                <span className="text-[13px] text-nav">{ruleText(r)}</span>
              </div>
              <div className="flex shrink-0 gap-1">
                <IconButton icon="edit" label={`Edit ${c.name} weight rule`} onClick={() => open(c, r)} />
                <IconButton icon="delete" label={`Remove ${c.name} weight rule`} onClick={() => remove(c, r)} />
              </div>
            </div>
          ))}
        </section>
      ))}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`${editing?.courier.name ?? ""} weight rule`} className="w-[620px] gap-4!">
        <Field label="Service (empty: all of the courier's services)" error={errors.service}>
          <TextInput value={form.service} onChange={(e) => setForm((f) => ({ ...f, service: e.target.value }))} disabled={!!editing?.rule} placeholder="e.g. International Priority" />
        </Field>
        <label className="flex cursor-pointer items-center gap-2.5 text-[14px] text-black">
          <input suppressHydrationWarning type="checkbox" checked={form.useVolumetric} onChange={(e) => setForm((f) => ({ ...f, useVolumetric: e.target.checked }))} className={checkbox} />
          Charge dimensional weight when it is more than the actual weight
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Dimensional divisor (L × W × H in cm ÷ …)" error={errors.divisor}>
            <TextInput value={form.divisor} onChange={(e) => setForm((f) => ({ ...f, divisor: e.target.value }))} inputMode="numeric" placeholder="e.g. 5000" disabled={!form.useVolumetric} />
          </Field>
          <Field label="Minimum chargeable weight (kg)" error={errors.minChargeableKg}>
            <TextInput value={form.minChargeableKg} onChange={(e) => setForm((f) => ({ ...f, minChargeableKg: e.target.value }))} inputMode="decimal" placeholder="None" />
          </Field>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[14px] font-medium text-black">Rounding (weight slab intervals)</legend>
          {form.steps.map((s, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-[14px] text-black">
              Up to
              <TextInput value={s.upToKg} onChange={(e) => setStep(i, "upToKg", e.target.value)} inputMode="decimal" placeholder="no limit" aria-label="Up to kg" className="w-[100px]!" />
              kg, round up to the next
              <TextInput value={s.stepKg} onChange={(e) => setStep(i, "stepKg", e.target.value)} inputMode="decimal" aria-label="Step kg" className="w-[90px]!" />
              kg
              <IconButton icon="delete" label="Remove this band" onClick={() => setForm((f) => ({ ...f, steps: f.steps.filter((_, j) => j !== i) }))} />
            </div>
          ))}
          {errors.steps && <p className="text-[13px] text-danger">{errors.steps}</p>}
          <button suppressHydrationWarning type="button" onClick={() => setForm((f) => ({ ...f, steps: [...f.steps, { upToKg: "", stepKg: "1" }] }))} className="cursor-pointer self-start text-[14px] font-semibold text-link">
            + Add a band
          </button>
          <p className="text-[13px] text-nav">For example: {example(form)}</p>
        </fieldset>
        <div>
          <ModalActions onCancel={() => setEditing(null)} onDone={save} doneLabel="Save" pending={saving} />
        </div>
      </Modal>
    </RatesFrame>
  );
}
