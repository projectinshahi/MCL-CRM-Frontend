"use client";

import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/components/feedback";
import { SkeletonLines } from "@/components/skeletons";
import { DateField, Field, LoadFailed, Modal, ModalActions, TextInput } from "@/components/ui";
import { api, ApiError, dateTime, fieldErrors, useApi } from "@/lib/api";
import { cellText, shownValue, type Shipment, type ShipmentDetail, type ShipmentField } from "@/lib/operations";

const dash = (v: string) => v || "------";
/** A field's value as the form edits it: the API's text (dates yyyy-mm-dd, weight in kg). */
const formText = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/**
 * One shipment: every column in the client's order, its extra columns, and the row exactly as it was imported.
 * Edit changes only what was changed; the imported row is kept as it was.
 */
export function ShipmentModal({ id, fields, options, onClose, onSaved }: {
  id: string | null;
  fields: ShipmentField[];
  options: Record<string, string[]>; // known values per list-like column, offered while typing
  onClose: () => void;
  onSaved: (s: Shipment) => void;
}) {
  const shipment = useApi<ShipmentDetail>(id && `/operations/shipments/${id}`);
  const [form, setForm] = useState<{ fields: Record<string, string>; extra: Record<string, string> } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const s = shipment.data?.id === id ? shipment.data : null;
  const close = () => {
    setForm(null);
    setErrors({});
    onClose();
  };
  const edit = () => s && setForm({ fields: Object.fromEntries(fields.map((f) => [f.key, formText(s[f.key])])), extra: { ...s.extra } });

  const save = async () => {
    if (!s || !form) return;
    // Only what changed is sent: an untouched column is never rewritten.
    const changed = Object.fromEntries(fields.filter((f) => form.fields[f.key] !== formText(s[f.key])).map((f) => [f.key, form.fields[f.key] || null]));
    const extra = Object.fromEntries(Object.keys(form.extra).filter((h) => form.extra[h] !== (s.extra[h] ?? "")).map((h) => [h, form.extra[h] || null]));
    if (!Object.keys(changed).length && !Object.keys(extra).length) return setForm(null);
    setSaving(true);
    try {
      const saved = await api<Shipment>(`/operations/shipments/${s.id}`, { method: "PATCH", body: { version: s.version, fields: changed, extra } });
      toast.success("Shipment saved");
      setForm(null);
      setErrors({});
      shipment.reload();
      onSaved(saved);
    } catch (err) {
      setErrors(fieldErrors(err));
      if (err instanceof ApiError && err.code === "STALE_SHIPMENT") shipment.reload();
      toast.apiError(err, "Couldn't save the shipment");
    } finally {
      setSaving(false);
    }
  };

  const title = s ? `Shipment ${s.awbNumber || s.awbNo || s.forwardingNo || ""}`.trim() : "Shipment";
  const source = s?.source ? Object.entries(s.source) : [];
  const extraKeys = form ? Object.keys(form.extra) : Object.keys(s?.extra ?? {});
  return (
    <Modal open={!!id} onClose={close} title={form ? `Edit ${title}` : title} className="w-[880px]">
      {!s && !shipment.error && <SkeletonLines rows={8} />}
      {!s && shipment.error && <LoadFailed what="the shipment" onRetry={shipment.reload} />}
      {s && !form && (
        <>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map((f) => (
              <div key={f.key} className="flex min-w-0 flex-col gap-0.5">
                <dt className="text-[13px] font-medium text-nav/80">{f.header}</dt>
                <dd className="text-[14px] font-medium break-words text-black">
                  {f.key === "customerName" && s.customer ? (
                    <Link href={`/customers/${s.customer.id}`} className="text-link hover:underline">
                      {shownValue(f, s[f.key])} ({s.customer.code})
                    </Link>
                  ) : (
                    dash(shownValue(f, s[f.key]))
                  )}
                </dd>
              </div>
            ))}
            {extraKeys.map((h) => (
              <div key={`x:${h}`} className="flex min-w-0 flex-col gap-0.5">
                <dt className="text-[13px] font-medium text-nav/80">{h}</dt>
                <dd className="text-[14px] font-medium break-words text-black">{dash(s.extra[h] ?? "")}</dd>
              </div>
            ))}
          </dl>
          <p className="text-[13px] text-nav">
            Added {dateTime(s.createdAt)} by {s.createdBy.name}
            {s.updatedBy && ` · last changed ${dateTime(s.updatedAt)} by ${s.updatedBy.name}`}
            {s.lastImport && ` · last imported from ${s.lastImport.fileName}`}
          </p>
          {source.length > 0 && (
            <details className="rounded-[12px] border border-stroke2 px-4 py-3">
              <summary className="cursor-pointer text-[14px] font-semibold text-black">Original Excel row (as imported, never edited)</summary>
              <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                {source.map(([h, c]) => (
                  <div key={h} className="flex min-w-0 gap-2 text-[13px]">
                    <dt className="shrink-0 font-medium text-nav/80">{h}:</dt>
                    <dd className="min-w-0 break-words text-black">{cellText(c)}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
          <div className="flex justify-end">
            <button suppressHydrationWarning type="button" onClick={edit} className="h-10 cursor-pointer rounded-[12px] bg-button px-4 text-[14px] font-medium text-white transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
              Edit
            </button>
          </div>
        </>
      )}
      {s && form && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map((f) => {
              const set = (v: string) => setForm((x) => x && { ...x, fields: { ...x.fields, [f.key]: v } });
              const value = form.fields[f.key] ?? "";
              return (
                <Field key={f.key} label={f.header} error={errors[f.key]}>
                  {f.type === "date" ? (
                    <DateField value={value} onChange={set} invalid={!!errors[f.key]} />
                  ) : (
                    <TextInput
                      value={value}
                      onChange={(e) => set(e.target.value)}
                      aria-invalid={!!errors[f.key] || undefined}
                      inputMode={f.type === "weight" ? "decimal" : f.type === "phone" ? "tel" : undefined}
                      list={options[f.key]?.length ? `ship-${f.key}` : undefined}
                    />
                  )}
                  {options[f.key]?.length ? (
                    <datalist id={`ship-${f.key}`}>
                      {options[f.key]!.map((o) => (
                        <option key={o} value={o} />
                      ))}
                    </datalist>
                  ) : null}
                </Field>
              );
            })}
            {extraKeys.map((h) => (
              <Field key={`x:${h}`} label={h}>
                <TextInput value={form.extra[h] ?? ""} onChange={(e) => setForm((x) => x && { ...x, extra: { ...x.extra, [h]: e.target.value } })} />
              </Field>
            ))}
          </div>
          <ModalActions onCancel={() => (setForm(null), setErrors({}))} onDone={save} doneLabel="Save" pending={saving} />
        </>
      )}
    </Modal>
  );
}
