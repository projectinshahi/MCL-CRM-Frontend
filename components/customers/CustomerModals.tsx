"use client";

import { useRef, useState } from "react";
import { useConfirm, useToast } from "@/components/feedback";
import { useMe } from "@/components/Shell";
import { Field, Modal, ModalActions, TextInput } from "@/components/ui";
import { Area, BIG, ErrCtx, Input, opts, PhoneField, PickField, Row, useFormSubmit, useLookups, type Ref } from "@/components/leads/LeadModals";
import { api } from "@/lib/api";
import { phoneError } from "@/lib/phone";

// ---------- API shape ----------
export type Customer = {
  id: string;
  code: string; // CU-00001
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  district: string | null;
  companyLocation: string | null;
  companyEmail: string | null;
  type: string | null; // "direct" | "b2b" for converted customers; older values are shown as stored
  source: Ref | null;
  assignee: Ref | null;
  status: "active" | "inactive";
  note: string | null;
  leadId: string | null; // the lead it was first created from
  createdAt: string;
  updatedAt: string;
};

export const CUSTOMER_TYPES = [
  { value: "direct", label: "Direct" },
  { value: "b2b", label: "B2B" },
];
export const typeLabel = (t: string | null) => CUSTOMER_TYPES.find((x) => x.value === t)?.label ?? t;
export const STATUSES = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

// Customer activity entries (Sprint 3).
export const ACTIVITY_TYPES = [
  { value: "initial", label: "Initial" },
  { value: "follow_up", label: "Follow Up" },
  { value: "call", label: "Call" },
];
export const activityLabel = (t: string) => ACTIVITY_TYPES.find((x) => x.value === t)?.label ?? t;
export type CustomerActivity = { id: string; type: string; occurredAt: string; notes: string | null; actor: Ref; createdAt: string };

/* ---------- Edit Customer: same fields, layout and behaviour as Edit Lead ---------- */
function EditCustomerForm({ customer: c, onClose, onSaved }: { customer: Customer; onClose: () => void; onSaved: (c: Customer) => void }) {
  const form = useRef<HTMLFormElement>(null);
  const { sources, users } = useLookups();
  const canReassign = !!useMe()?.permissions.includes("all_records"); // the API enforces it too
  const { pending, errors, run, clearOnInput, toast } = useFormSubmit("Couldn't save the customer");
  return (
    <ErrCtx value={errors}>
      <form
        ref={form}
        noValidate
        onInput={clearOnInput}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const v = (k: string) => String(f.get(k) ?? "").trim();
          const savedPhone = c.phone ?? "";
          const phoneChanged = String(f.get("phone") ?? "") !== savedPhone; // untouched: left out, never rewritten
          const checks: Record<string, string> = {};
          if (!v("name")) checks.name = "Enter the customer's name";
          const problem = phoneChanged && phoneError(String(f.get("phone") ?? ""));
          if (problem) checks.phone = problem;
          run(e.currentTarget, checks, async () => {
            // Blank optional fields are cleared on the server; selects are only sent once they have a value.
            const body = {
              name: v("name"),
              company: v("company"),
              email: v("email"),
              address: v("address"),
              district: v("district"),
              companyLocation: v("companyLocation"),
              companyEmail: v("companyEmail"),
              note: v("note"),
              ...(phoneChanged && { phone: v("phone") }),
              ...(v("type") && { type: v("type") }),
              ...(v("sourceId") && { sourceId: v("sourceId") }),
              ...(v("assignedUserId") && { assignedUserId: v("assignedUserId") }),
              ...(v("status") && { status: v("status") }),
            };
            const saved = await api<Customer>(`/customers/${c.id}`, { method: "PATCH", body });
            toast.success("Customer updated", `Changes to “${saved.name}” were saved.`);
            onSaved(saved);
          });
        }}
        className="flex flex-col gap-5"
      >
        <div className="flex flex-col gap-4">
          <Row>
            <Input label="Customer Name" name="name" placeholder="eg, Praveen" initial={c.name} required />
            <PickField label="Customer Type" name="type" options={CUSTOMER_TYPES} initial={c.type ?? ""} placeholder="eg, Direct" />
          </Row>
          <Row>
            <PhoneField initial={c.phone} />
            <Input label="EMail" name="email" type="email" placeholder="eg, asdfg@gmail.com" initial={c.email} />
          </Row>
          <Input label="Company Name" name="company" placeholder="eg., Custom" initial={c.company} />
          <Row>
            <Input label="Company Location" name="companyLocation" placeholder="eg, Karnataka" initial={c.companyLocation} />
            <Input label="Company EMail" name="companyEmail" type="email" placeholder="eg, asdfg@gmail.com" initial={c.companyEmail} />
          </Row>
          <Area label="Address" name="address" initial={c.address} />
          <Row>
            <Input label="District" name="district" initial={c.district} />
            <PickField label="Source" name="sourceId" options={opts(sources)} initial={c.source?.id} placeholder="eg, Meta Ads" />
          </Row>
          <Row>
            {canReassign ? (
              <PickField label="Assigned User" name="assignedUserId" options={opts(users)} initial={c.assignee?.id} placeholder="eg, Karthik" />
            ) : (
              <Field label="Assigned User">
                <TextInput readOnly value={c.assignee?.name ?? "Not assigned"} title="Only roles that can see all records can reassign customers." className="opacity-60" />
              </Field>
            )}
            <PickField label="Status" name="status" options={STATUSES} initial={c.status} />
          </Row>
          <Area label="Note" name="note" initial={c.note} />
        </div>
        <ModalActions onCancel={onClose} onDone={() => form.current?.requestSubmit()} pending={pending} />
      </form>
    </ErrCtx>
  );
}

export function CustomerEditModal({ customer, onClose, onSaved }: { customer: Customer | null; onClose: () => void; onSaved: (c: Customer) => void }) {
  return (
    <Modal open={customer !== null} onClose={onClose} title="Edit Customer" className={BIG}>
      {customer && <EditCustomerForm key={customer.id} customer={customer} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

/* ---------- Add Activity: Initial / Follow Up / Call, when it happened, notes ---------- */
const localNow = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16); // value for <input type="datetime-local">
};

function ActivityForm({ customerId, onClose, onSaved }: { customerId: string; onClose: () => void; onSaved: () => void }) {
  const form = useRef<HTMLFormElement>(null);
  const [id] = useState(() => crypto.randomUUID()); // one per form: a retry after a lost response isn't saved twice
  const [now] = useState(localNow);
  const { pending, errors, run, clearOnInput, toast } = useFormSubmit("Couldn't add the activity");
  return (
    <ErrCtx value={errors}>
      <form
        ref={form}
        noValidate
        onInput={clearOnInput}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const type = String(f.get("type") ?? "");
          const when = String(f.get("occurredAt") ?? "");
          const checks: Record<string, string> = {};
          if (!type) checks.type = "Choose Initial, Follow Up or Call";
          if (!when) checks.occurredAt = "Pick when it happened";
          else if (new Date(when).getTime() > Date.now() + 5 * 60_000) checks.occurredAt = "Can't be in the future";
          run(e.currentTarget, checks, async () => {
            await api(`/customers/${customerId}/activities`, {
              method: "POST",
              body: { id, type, occurredAt: new Date(when).toISOString(), notes: String(f.get("notes") ?? "").trim() },
            });
            toast.success("Activity added", `${activityLabel(type)} on ${new Date(when).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}.`);
            onSaved();
          });
        }}
        className="flex flex-col gap-5"
      >
        <div className="flex flex-col gap-4">
          <Row>
            <PickField label="Activity Type" name="type" options={ACTIVITY_TYPES} placeholder="eg, Call" required />
            <Input label="Date and Time" name="occurredAt" type="datetime-local" initial={now} required />
          </Row>
          <Area label="Notes" name="notes" placeholder="What was discussed, next steps…" />
        </div>
        <ModalActions onCancel={onClose} onDone={() => form.current?.requestSubmit()} pending={pending} doneLabel="Add Activity" />
      </form>
    </ErrCtx>
  );
}

export function ActivityModal({ customerId, open, onClose, onSaved }: { customerId: string; open: boolean; onClose: () => void; onSaved: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Add Activity">
      {open && <ActivityForm customerId={customerId} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

/**
 * Activate / Deactivate (customers are never deleted). Deactivating asks first; activating doesn't. `busy` is the
 * id being saved, for that button's spinner; `onSaved` gets the server's copy.
 */
export function useCustomerStatus(onSaved: (c: Customer) => void) {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const toggle = async (c: Customer) => {
    if (busy) return;
    const next = c.status === "active" ? "inactive" : "active";
    if (
      next === "inactive" &&
      !(await confirm({
        title: "Deactivate customer?",
        message: (
          <>
            <b className="text-black">{c.name}</b> ({c.code}) will be marked inactive and leave the active count. Their record, files and history are
            kept, and you can activate them again at any time.
          </>
        ),
        confirmLabel: "Deactivate",
      }))
    )
      return;
    setBusy(c.id);
    try {
      const saved = await api<Customer>(`/customers/${c.id}`, { method: "PATCH", body: { status: next } });
      toast.success(next === "active" ? "Customer activated" : "Customer deactivated", `${saved.name} (${saved.code}) is now ${next}.`);
      onSaved(saved);
    } catch (err) {
      toast.apiError(err, next === "active" ? "Couldn't activate the customer" : "Couldn't deactivate the customer");
    } finally {
      setBusy(null);
    }
  };
  return { toggle, busy };
}
