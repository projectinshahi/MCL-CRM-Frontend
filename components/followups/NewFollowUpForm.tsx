"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/feedback";
import { Field, ModalActions, SelectField, TextArea } from "@/components/ui";
import { api, fieldErrors, useApi, useDebounced } from "@/lib/api";

export type FollowUp = {
  id: string;
  note: string;
  lead: { id: string; label: string };
  type: "whatsapp" | "call" | "email" | "meeting";
  assignee: { id: string; name: string } | null;
  status: "pending" | "overdue" | "completed";
  dueDate: string;
  nextFollowUpDate: string | null;
  completedAt: string | null;
  createdAt: string;
};

export const TYPE_LABEL: Record<FollowUp["type"], string> = { whatsapp: "WhatsApp", call: "Call", email: "Email", meeting: "Meeting" };
const TYPES = Object.entries(TYPE_LABEL) as [FollowUp["type"], string][];

// "2026-10-13" → "13/10/2026" (en-IN, like the table)
const fmt = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${+d!}/${+m!}/${y}`;
};

// Figma 1:8057 look ("00/00/0000" + calendar icon); clicking opens the native date picker.
function DateField({ value, onChange, invalid }: { value: string; onChange: (v: string) => void; invalid?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="relative">
      <button suppressHydrationWarning
        type="button"
        onClick={() => ref.current?.showPicker()}
        data-invalid={invalid || undefined}
        className="flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-[12px] border border-stroke2 bg-bg5 px-3.5 py-[9px] text-left text-[14px] leading-5 font-medium text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus data-invalid:border-danger"
      >
        <span className={`flex-1 ${value ? "" : "opacity-50"}`}>{value ? fmt(value) : "00/00/0000"}</span>
        <Icon name="calendar" size={16} className="text-nav" />
      </button>
      <input suppressHydrationWarning
        ref={ref}
        type="date"
        tabIndex={-1}
        aria-hidden
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pointer-events-none absolute bottom-0 left-0 h-px w-full opacity-0"
      />
    </div>
  );
}

// Figma 1:8040 "New Follow Up" form body (header + X come from <Modal>). With `followUp` it edits that one instead:
// filled in, its lead fixed (a follow-up stays on its lead), and only the changed assignee is sent.
// Server field → the form control it belongs to; anything else goes to a toast.
const FIELDS = ["leadId", "followUpDate", "nextFollowUpDate", "note", "type", "assignedUserId"];

export function NewFollowUpForm({ followUp, onCancel, onSaved }: { followUp?: FollowUp; onCancel: () => void; onSaved: () => void }) {
  const form = useRef<HTMLFormElement>(null);
  // The API sends the 20 newest matches: the picker searches, so any lead can be found (not only the newest 20).
  const [leadQuery, setLeadQuery] = useState("");
  const lookup = useApi<{ leadId: string; label: string }[]>(followUp ? null : "/lookups/lead-contacts", { q: useDebounced(leadQuery) }).data ?? [];
  const leads = followUp ? [{ leadId: followUp.lead.id, label: followUp.lead.label }] : lookup;
  const users = useApi<{ id: string; name: string }[]>("/users/options", undefined, 0, { keep: true }).data ?? [];
  // Chosen by id, never by label: two leads (or users) can share a name.
  const [lead, setLead] = useState<{ id: string; label: string } | null>(followUp ? { id: followUp.lead.id, label: followUp.lead.label } : null);
  const [date, setDate] = useState(followUp?.dueDate ?? "");
  const [next, setNext] = useState(followUp?.nextFollowUpDate ?? "");
  const [note, setNote] = useState(followUp?.note ?? "");
  const [type, setType] = useState(followUp ? TYPE_LABEL[followUp.type] : "");
  const [assigned, setAssigned] = useState(followUp?.assignee?.id ?? "");
  const assigneeName = users.find((u) => u.id === assigned)?.name ?? (assigned && assigned === followUp?.assignee?.id ? followUp.assignee.name : "");
  // A new follow-up's id, chosen here once per form: saving again after a lost reply can't add it twice.
  const [newId] = useState(() => crypto.randomUUID());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  // Changing a field clears its message.
  const change =
    <T,>(field: string, set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setErrors((x) => (x[field] ? { ...x, [field]: "" } : x));
    };

  return (
    <form
      ref={form}
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if (saving) return;
        const local: Record<string, string> = {};
        if (!lead) local.leadId = "Select a lead";
        if (!date) local.followUpDate = "Pick a follow-up date";
        if (next && date && next < date) local.nextFollowUpDate = "Must be on or after the follow-up date";
        if (!note.trim()) local.note = "Enter a subject or note";
        setErrors(local);
        if (Object.keys(local).length) return;
        setSaving(true);
        const values = { followUpDate: date, nextFollowUpDate: next, note, type: TYPES.find(([, l]) => l === type)?.[0] ?? "whatsapp" };
        const assignee = assigned && assigned !== followUp?.assignee?.id ? { assignedUserId: assigned } : {}; // default: me / unchanged
        try {
          if (followUp) {
            await api(`/follow-ups/${followUp.id}`, { method: "PATCH", body: { ...values, ...assignee } });
            toast.success("Follow-up updated", `“${note.trim()}” for ${lead!.label}.`);
          } else {
            await api("/follow-ups", { method: "POST", body: { id: newId, leadId: lead!.id, ...values, ...assignee } });
            toast.success("Follow-up added", `“${note.trim()}” for ${lead!.label}.`);
          }
          onSaved();
        } catch (err) {
          const fields = fieldErrors(err);
          const inline = Object.fromEntries(Object.entries(fields).filter(([k]) => FIELDS.includes(k)));
          setErrors(inline);
          if (Object.keys(inline).length < Object.keys(fields).length || !Object.keys(fields).length)
            toast.apiError(err, followUp ? "Couldn't update the follow-up" : "Couldn't add the follow-up");
        } finally {
          setSaving(false);
        }
      }}
      className="flex flex-col gap-5"
    >
      <div className="flex flex-col gap-4">
        {/* Figma selects: pl-24 pr-12 (inside stroke) */}
        <Field label="Lead / Contact" error={errors.leadId} required>
          <SelectField
            value={lead?.id ?? ""}
            display={lead?.label ?? ""}
            options={leads.map((l) => ({ value: l.leadId, label: l.label }))}
            onChange={change("leadId", (id: string) => setLead({ id, label: leads.find((l) => l.leadId === id)!.label }))}
            {...(!followUp && { search: leadQuery, onSearch: setLeadQuery })}
            placeholder="Select a lead"
            invalid={!!errors.leadId}
            className="pr-3"
          />
        </Field>
        <div className="flex flex-col gap-4 sm:flex-row sm:gap-3">
          <Field label="Follow Up Date" error={errors.followUpDate} required>
            <DateField value={date} onChange={change("followUpDate", setDate)} invalid={!!errors.followUpDate} />
          </Field>
          <Field label="Next Follow Up Date" error={errors.nextFollowUpDate}>
            <DateField value={next} onChange={change("nextFollowUpDate", setNext)} invalid={!!errors.nextFollowUpDate} />
          </Field>
        </div>
        <Field label="Subject/ Note" error={errors.note} required>
          <TextArea placeholder="Follow Up On Proposal" value={note} onChange={(e) => change("note", setNote)(e.target.value)} aria-invalid={!!errors.note} aria-required />
        </Field>
        <div className="flex flex-col gap-4 sm:flex-row sm:gap-3">
          <Field label="Follow Up Type" error={errors.type}>
            <SelectField value={type} options={TYPES.map(([, l]) => l)} onChange={change("type", setType)} placeholder="WhatsApp" invalid={!!errors.type} className="pr-[11px]" />
          </Field>
          <Field label="Assigned To" error={errors.assignedUserId}>
            <SelectField value={assigned} display={assigneeName} options={users.map((u) => ({ value: u.id, label: u.name }))} onChange={change("assignedUserId", setAssigned)} placeholder="Me" invalid={!!errors.assignedUserId} className="pr-[11px]" />
          </Field>
        </div>
      </div>
      <ModalActions onCancel={onCancel} onDone={() => form.current?.requestSubmit()} doneLabel="Save Follow Up" pending={saving} />
    </form>
  );
}
