"use client";

import { useState } from "react";
import { useRemove, useToast } from "@/components/feedback";
import { card, checkbox, h2, primary, RatesFrame, secondary } from "@/components/rates/RatesFrame";
import { SkeletonLines } from "@/components/skeletons";
import { Badge, EmptyState, Field, IconButton, LoadFailed, Modal, ModalActions, TextInput } from "@/components/ui";
import { api, fieldErrors, useApi } from "@/lib/api";
import type { Account, Courier } from "@/lib/rates";

// Couriers (DTDC, DHL, FedEx, …: as the administrator names them) and their accounts: added, renamed, made inactive
// (their rate cards stop being used) or deleted (with their own rate cards).
type Editing =
  | { what: "courier"; courier: Courier | null }
  | { what: "account"; courier: Courier; account: Account | null };

export default function CouriersPage() {
  const couriers = useApi<Courier[]>("/couriers");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [form, setForm] = useState({ name: "", note: "", active: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const { remove, removing } = useRemove(couriers.reload);
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const delCourier = (c: Courier) =>
    remove(c.id, {
      path: `/couriers/${c.id}`,
      title: `Delete ${c.name}?`,
      message: (
        <>
          <b className="text-black">{c.name}</b> will be deleted with its {plural(c.rateCards, "rate card")}, {plural(c.accounts.length, "account")} and weight rules. To keep them, make it inactive instead (Edit).
        </>
      ),
      confirmLabel: "Delete",
      success: "Courier deleted",
      successDetail: c.name,
      failTitle: "Couldn't delete the courier",
    });
  const delAccount = (a: Account) =>
    remove(a.id, {
      path: `/courier-accounts/${a.id}`,
      title: `Delete account ${a.name}?`,
      message: (
        <>
          <b className="text-black">{a.name}</b> will be deleted with its own {plural(a.rateCards ?? 0, "rate card")}. The courier&apos;s general rates stay.
        </>
      ),
      confirmLabel: "Delete",
      success: "Account deleted",
      successDetail: a.name,
      failTitle: "Couldn't delete the account",
    });

  const open = (e: Editing) => {
    setEditing(e);
    const item = e.what === "courier" ? e.courier : e.account;
    setForm({ name: item?.name ?? "", note: e.what === "account" ? (e.account?.note ?? "") : "", active: item?.active ?? true });
    setErrors({});
  };
  const save = async () => {
    if (!editing || saving) return;
    if (!form.name.trim()) return setErrors({ name: "Enter a name" });
    setSaving(true);
    try {
      if (editing.what === "courier")
        await (editing.courier ? api(`/couriers/${editing.courier.id}`, { method: "PATCH", body: { name: form.name, active: form.active } }) : api("/couriers", { method: "POST", body: { name: form.name } }));
      else
        await (editing.account
          ? api(`/courier-accounts/${editing.account.id}`, { method: "PATCH", body: { name: form.name, note: form.note || null, active: form.active } })
          : api(`/couriers/${editing.courier.id}/accounts`, { method: "POST", body: { name: form.name, note: form.note || null } }));
      toast.success(editing.what === "courier" ? "Courier saved" : "Account saved", form.name);
      setEditing(null);
      couriers.reload();
    } catch (err) {
      const f = fieldErrors(err);
      if (Object.keys(f).length) setErrors(f);
      else toast.apiError(err, "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const isNew = editing && (editing.what === "courier" ? !editing.courier : !editing.account);
  return (
    <RatesFrame sub={1} action={<button suppressHydrationWarning type="button" onClick={() => open({ what: "courier", courier: null })} className={primary}>+ Add courier</button>}>
      {!couriers.data && !couriers.error && <SkeletonLines rows={4} />}
      {!couriers.data && couriers.error && <LoadFailed what="couriers" onRetry={couriers.reload} />}
      {couriers.data?.length === 0 && (
        <section className={card}>
          <EmptyState>No couriers yet. Add each courier you have rates for (e.g. DTDC, DHL, FedEx).</EmptyState>
        </section>
      )}
      {couriers.data?.map((c) => (
        <section key={c.id} className={card}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className={h2}>{c.name}</h2>
              {!c.active && <Badge label="Inactive" tone="slate" />}
              <span className="text-[13px] text-nav">{c.rateCards} rate card{c.rateCards === 1 ? "" : "s"}</span>
            </div>
            <div className="flex gap-2">
              <button suppressHydrationWarning type="button" onClick={() => open({ what: "account", courier: c, account: null })} className={secondary}>+ Add account</button>
              <IconButton icon="edit" label={`Edit ${c.name}`} onClick={() => open({ what: "courier", courier: c })} />
              <IconButton icon="delete" label={`Delete ${c.name}`} onClick={() => delCourier(c)} disabled={removing === c.id} />
            </div>
          </div>
          {c.accounts.length === 0 ? (
            <p className="text-[14px] text-nav">No accounts: its rate cards are general rates. Add an account for rates negotiated for it.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-stroke2 border-y border-stroke2">
              {c.accounts.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-[14px] font-semibold break-words text-black">
                      {a.name} {!a.active && <Badge label="Inactive" tone="slate" className="ml-1" />}
                    </span>
                    {a.note && <span className="text-[13px] text-nav">{a.note}</span>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <IconButton icon="edit" label={`Edit ${a.name}`} onClick={() => open({ what: "account", courier: c, account: a })} />
                    <IconButton icon="delete" label={`Delete ${a.name}`} onClick={() => delAccount(a)} disabled={removing === a.id} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.what === "courier" ? (isNew ? "Add courier" : "Edit courier") : isNew ? `Add ${editing?.courier?.name} account` : "Edit account"}
        className="w-[480px] gap-4!"
      >
        <Field label={editing?.what === "courier" ? "Courier name" : "Account name or number"} error={errors.name} required>
          <TextInput value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} aria-invalid={!!errors.name || undefined} onKeyDown={(e) => e.key === "Enter" && save()} data-autofocus />
        </Field>
        {editing?.what === "account" && (
          <Field label="Note" error={errors.note}>
            <TextInput value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="e.g. Cochin office account" />
          </Field>
        )}
        {!isNew && (
          <label className="flex cursor-pointer items-center gap-2.5 text-[14px] text-black">
            <input suppressHydrationWarning type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} className={checkbox} />
            Active (inactive: its rate cards aren&apos;t used by the calculator)
          </label>
        )}
        <div>
          <ModalActions onCancel={() => setEditing(null)} onDone={save} doneLabel="Save" pending={saving} />
        </div>
      </Modal>
    </RatesFrame>
  );
}
