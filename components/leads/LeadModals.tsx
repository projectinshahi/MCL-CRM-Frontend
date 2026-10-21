"use client";

import { createContext, use, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { FIELD_LABEL, Field, Modal, ModalActions, SelectField, TextArea, TextInput } from "@/components/ui";
import { useToast } from "@/components/feedback";
import { PhoneInput } from "@/components/PhoneInput";
import { Loading, Skeleton } from "@/components/skeletons";
import { AttachmentList, AttachmentPicker, type Attachment } from "@/components/leads/Attachments";
import { api, cap, dateTime, day, fieldErrors, upload, useApi } from "@/lib/api";
import type { Picked } from "@/lib/attachments";
import { phoneError } from "@/lib/phone";

// ---------- API shapes ----------
export type Ref = { id: string; name: string };
export type Status = Ref & { isWon: boolean; isLost: boolean };
export type Lead = {
  id: string;
  title: string;
  description: string | null;
  address: string | null;
  district: string | null;
  contact: { name: string | null; phone: string | null; email: string | null };
  customerType: "direct" | "b2b" | null;
  company: { name: string | null; location: string | null; email: string | null };
  source: Ref | null;
  status: Status;
  priority: "low" | "medium" | "high";
  expectedValue: number | null;
  paymentStatus: "pending" | "completed";
  owner: Ref | null;
  shipment: Record<"destinationCountry" | "commodity" | "volume" | "pickupLocation" | "deliveryLocation", string | null> & {
    shipmentType: "air" | "water" | null;
    weightKg: number | null;
  };
  attachments?: Attachment[]; // only on a single lead (detail, create), never in lists
  customer: { id: string; code: string; name: string; deleted: boolean } | null; // set once converted
  convertedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export const PRIORITIES = ["low", "medium", "high"] as const;

/** Lookups behind the Source / Assigned User / Stage selects (fetched while a form is open; the last copy shows at once). */
export function useLookups(enabled = true) {
  const sources = useApi<(Ref & { active: boolean })[]>(enabled ? "/settings/lead-sources" : null, undefined, 0, { keep: true }).data ?? [];
  const statuses = useApi<Status[]>(enabled ? "/settings/lead-statuses" : null, undefined, 0, { keep: true }).data ?? [];
  const users = useApi<Ref[]>(enabled ? "/users/options" : null, undefined, 0, { keep: true }).data ?? [];
  return { sources: sources.filter((s) => s.active), statuses, users };
}

// ---------- inline field errors ----------
// API field path → name of the form input whose message it is.
const INPUT_FOR: Record<string, string> = {
  "contact.name": "customer",
  "contact.phone": "phone",
  "contact.email": "email",
  "company.name": "company",
  "company.location": "companyLocation",
  "company.email": "companyEmail",
  expectedValue: "value",
  "shipment.destinationCountry": "destination",
  "shipment.commodity": "commodity",
  "shipment.shipmentType": "shipmentType",
  "shipment.weightKg": "weight",
  "shipment.volume": "volume",
  "shipment.pickupLocation": "pickup",
  "shipment.deliveryLocation": "delivery",
  dueAt: "due",
};
// Form building blocks below are shared with the customer form (components/customers).
export const ErrCtx = createContext<Record<string, string>>({});
const useErr = (name: string) => use(ErrCtx)[name];
const without = (o: Record<string, string>, key: string) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== key));

/**
 * One request at a time. Local checks and server field errors appear under their inputs (typed values stay);
 * anything not tied to a visible field becomes an error toast. Success toasts are the caller's, after the API answers.
 */
export function useFormSubmit(failTitle: string) {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // After a refused submit, the first field with a message is focused (and so scrolled into view in long forms).
  const refused = useRef<HTMLFormElement | null>(null);
  useEffect(() => {
    refused.current?.querySelector<HTMLElement>('[aria-invalid="true"], button[data-invalid]')?.focus();
    refused.current = null;
  }, [errors]);
  const run = async (form: HTMLFormElement, local: Record<string, string>, call: () => Promise<void>) => {
    if (pending) return;
    setErrors(local);
    if (Object.keys(local).length) return void (refused.current = form);
    setPending(true);
    try {
      await call();
    } catch (err) {
      const inline: Record<string, string> = {};
      let unplaced = false;
      for (const [path, message] of Object.entries(fieldErrors(err))) {
        const input = INPUT_FOR[path] ?? path;
        if (form.querySelector(`[name="${input}"]`)) inline[input] = message;
        else unplaced = true;
      }
      setErrors(inline);
      if (Object.keys(inline).length) refused.current = form;
      if (unplaced || !Object.keys(inline).length) toast.apiError(err, failTitle);
    } finally {
      setPending(false);
    }
  };
  // Typing in a field clears its message.
  const clearOnInput = (e: FormEvent<HTMLFormElement>) => {
    const el = e.target as HTMLInputElement;
    const name = el.name || el.dataset.name;
    if (name && errors[name]) setErrors((x) => without(x, name));
  };
  return { pending, errors, run, clearOnInput, toast };
}

export type Option = { value: string; label: string };
export const opts = (xs: Ref[]): Option[] => xs.map((x) => ({ value: x.id, label: x.name }));

// Designed select + a hidden input so the value travels with the form.
export function PickField({ label, name, options, initial = "", placeholder, required }: { label: string; name: string; options: Option[]; initial?: string; placeholder?: string; required?: boolean }) {
  const [value, setValue] = useState(initial);
  const error = useErr(name);
  return (
    <Field label={label} error={error} required={required}>
      {/* By value: two users (or sources) with the same name are still two different choices. */}
      <SelectField value={value} options={options} display={options.find((o) => o.value === value)?.label ?? ""} onChange={setValue} placeholder={placeholder} invalid={!!error} />
      <input suppressHydrationWarning type="hidden" name={name} value={value} />
    </Field>
  );
}

const digits = (v: string) => v.replace(/[^\d.]/g, "");

/** Form → API body. Blank fields become null on the server; sections a form lacks are left out (unchanged). */
function leadBody(f: FormData, customerType?: "direct" | "b2b") {
  const v = (k: string) => String(f.get(k) ?? "").trim();
  const has = (k: string) => f.has(k);
  return {
    title: v("title"),
    contact: { name: v("customer"), phone: v("phone"), email: v("email") },
    ...(customerType && { customerType }),
    ...(has("company") && { company: { name: v("company"), location: v("companyLocation"), email: v("companyEmail") } }),
    address: v("address"),
    description: v("description"),
    sourceId: v("sourceId"),
    ...(v("ownerId") && { ownerId: v("ownerId") }),
    ...(v("statusId") && { statusId: v("statusId") }),
    ...(v("priority") && { priority: v("priority") }),
    expectedValue: digits(v("value")),
    ...(has("destination") && {
      shipment: {
        destinationCountry: v("destination"),
        commodity: v("commodity"),
        shipmentType: v("shipmentType"),
        weightKg: digits(v("weight")),
        volume: v("volume"),
        pickupLocation: v("pickup"),
        deliveryLocation: v("delivery"),
      },
    }),
  };
}

// Create/Edit Lead (Figma 1:7358 / 1:7595): two or three fields a row; the form scrolls between the pinned title and buttons.
export const BIG = "w-[800px]";

export const Row = ({ children }: { children: ReactNode }) => <div className="flex flex-col gap-4 sm:flex-row sm:gap-3">{children}</div>;

export function Input({ label, name, placeholder, type, initial, required }: { label: string; name: string; placeholder?: string; type?: string; initial?: string | number | null; required?: boolean }) {
  const error = useErr(name);
  return (
    <Field label={label} error={error} required={required}>
      <TextInput name={name} placeholder={placeholder} type={type} defaultValue={initial ?? ""} aria-invalid={!!error} aria-required={required || undefined} />
    </Field>
  );
}

export function Area({ label, name, placeholder, initial }: { label: string; name: string; placeholder?: string; initial?: string | null }) {
  const error = useErr(name);
  return (
    <Field label={label} error={error}>
      <TextArea name={name} placeholder={placeholder} defaultValue={initial ?? ""} aria-invalid={!!error} />
    </Field>
  );
}

// Lead Title … Description (shared by Create 1:7358/1:7470 and Edit 1:7595)
function LeadFieldsBlock({ lead, contactRow, children }: { lead?: Lead; contactRow: ReactNode; children?: ReactNode }) {
  const { sources, statuses, users } = useLookups();
  return (
    <>
      <Input label="Lead Title" name="title" placeholder="eg., Custom" initial={lead?.title} required />
      {contactRow}
      {children}
      <Area label="Address" name="address" placeholder="eg., Lorem Ipsum is simply dummy text of the printing and typesetting industry" initial={lead?.address} />
      <Row>
        <PickField label="Source" name="sourceId" options={opts(sources)} initial={lead?.source?.id} placeholder="eg, Meta Ads" />
        <PickField label="Assigned User" name="ownerId" options={opts(users)} initial={lead?.owner?.id} placeholder="eg, Karthik" />
      </Row>
      <Row>
        <PickField label="Stage" name="statusId" options={opts(statuses)} initial={lead?.status.id} placeholder="eg., New" />
        <PickField label="Priority" name="priority" options={PRIORITIES.map((p) => ({ value: p, label: cap(p) }))} initial={lead?.priority} placeholder="eg, Medium" />
      </Row>
      <Row>
        {/* Set by the server; back-dating is an open business question (report Q7). */}
        <Field label="Created Date">
          <TextInput readOnly value={day(lead?.createdAt ?? new Date().toISOString())} className="opacity-60" />
        </Field>
        <Input label="Expected Value" name="value" placeholder="eg, ₹00000000" initial={lead?.expectedValue} />
      </Row>
      <Area label="Description" name="description" placeholder="eg., Ipsum is simply dummy text of the printing " initial={lead?.description} />
    </>
  );
}

const SHIPMENT_TYPES: Option[] = [
  { value: "air", label: "Air" },
  { value: "water", label: "Water" },
];

/** "Logistic - Specific Fields": empty on Create, the lead's saved values on Edit. */
function LogisticsFields({ lead }: { lead?: Lead }) {
  const s = lead?.shipment;
  return (
    <>
      <h3 className="border-b border-stroke2 pb-3 text-[16px] font-semibold tracking-[-0.32px] text-black">Logistic - Specific Fields</h3>
      <Row>
        <Input label="Destination Country" name="destination" initial={s?.destinationCountry} />
        <Input label="Commodity" name="commodity" initial={s?.commodity} />
      </Row>
      <Row>
        <PickField label="Shipment Type" name="shipmentType" options={SHIPMENT_TYPES} initial={s?.shipmentType ?? ""} placeholder="eg, Air" />
        <Input label="Weight" name="weight" placeholder="kg" initial={s?.weightKg} />
        <Input label="Shipment Volume" name="volume" initial={s?.volume} />
      </Row>
      <Row>
        <Input label="Pickup Location" name="pickup" initial={s?.pickupLocation} />
        <Input label="Delivery Location" name="delivery" initial={s?.deliveryLocation} />
      </Row>
    </>
  );
}

/** Checks before sending. A saved phone the user did not touch is neither re-checked nor sent. */
function leadChecks(f: FormData, savedPhone = "") {
  const e: Record<string, string> = {};
  if (!String(f.get("title") ?? "").trim()) e.title = "Enter a lead title";
  const phone = String(f.get("phone") ?? "");
  const problem = phone !== savedPhone && phoneError(phone);
  if (problem) e.phone = problem;
  return e;
}

export function PhoneField({ initial }: { initial?: string | null }) {
  const id = useId();
  const error = useErr("phone");
  return (
    <Field label="Phone Number" htmlFor={id}>
      <PhoneInput id={id} name="phone" defaultValue={initial} error={error} />
    </Field>
  );
}

/* ---------- Create Lead (1:7358 Direct / 1:7470 B2B) ---------- */
function CreateLeadForm({ onClose, onCreate }: { onClose: () => void; onCreate: (lead: Lead) => void }) {
  const form = useRef<HTMLFormElement>(null);
  const [type, setType] = useState<"Direct" | "B2B">("Direct");
  const [files, setFiles] = useState<Picked[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  // One id per form: a second Done (or a retry after a lost response) finds this lead instead of making another.
  const [leadId] = useState(() => crypto.randomUUID());
  const filesId = useId();
  const { pending, errors, run, clearOnInput, toast } = useFormSubmit("Couldn't create the lead");

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const checks = leadChecks(f);
    // The lead's customer is created with it, named after the contact or the company (as the server requires).
    if (!String(f.get("customer") ?? "").trim() && !String(f.get("company") ?? "").trim()) checks.customer = "Enter the customer's name, or a company name for a B2B lead";
    if (files.some((x) => x.preparing)) checks.attachments = "Wait until the files have finished compressing.";
    else if (files.some((x) => x.error)) checks.attachments = "Remove the files marked in red, or replace them, before saving.";
    run(e.currentTarget, checks, async () => {
      const body = { ...leadBody(f, type === "B2B" ? "b2b" : "direct"), id: leadId };
      let lead: Lead;
      if (files.length) {
        const form = new FormData();
        form.append("lead", JSON.stringify(body));
        form.append("originalSizes", JSON.stringify(files.map((x) => x.originalSize)));
        for (const x of files) form.append("files", x.file, x.file.name);
        setProgress(0);
        try {
          lead = await upload<Lead>("/leads", form, setProgress);
        } finally {
          setProgress(null);
        }
      } else lead = await api<Lead>("/leads", { method: "POST", body });
      const n = lead.attachments?.length ?? 0;
      const withFiles = n ? ` with ${n} file${n === 1 ? "" : "s"}` : "";
      toast.success("Lead created", `“${lead.title}” was added to the pipeline${withFiles}${lead.customer ? `, and customer ${lead.customer.code} was created` : ""}.`);
      onCreate(lead);
    });
  };

  return (
    <ErrCtx value={errors}>
    <form ref={form} noValidate onSubmit={submit} onInput={clearOnInput} className="flex flex-col gap-5">
      <div className="flex flex-col gap-4">
        <LeadFieldsBlock
          contactRow={
            <>
              <Row>
                <Input label="Customer Name" name="customer" placeholder="eg, Praveen" />
                <PhoneField />
              </Row>
              <Row>
                <Input label="EMail" name="email" type="email" placeholder="eg, asdfg@gmail.com" />
                {/* Figma 1:7760 / 1:7765: the same dropdown as every other field */}
                <Field label="Customer Type">
                  <SelectField value={type} options={["Direct", "B2B"]} onChange={(t) => setType(t as "Direct" | "B2B")} placeholder="Customer Type" />
                </Field>
              </Row>
            </>
          }
        >
          {type === "B2B" && (
            <>
              <Input label="Company Name" name="company" placeholder="eg., Custom" />
              <Row>
                <Input label="Company Location" name="companyLocation" placeholder="eg, Karnataka" />
                <Input label="Company EMail" name="companyEmail" type="email" placeholder="eg, asdfg@gmail.com" />
              </Row>
            </>
          )}
        </LeadFieldsBlock>
      </div>

      <LogisticsFields />
      <Field label="Attach Files" htmlFor={filesId} error={errors.attachments}>
        <AttachmentPicker id={filesId} items={files} setItems={setFiles} disabled={pending} />
      </Field>
      <ModalActions
        onCancel={onClose}
        onDone={() => form.current?.requestSubmit()}
        pending={pending}
        pendingLabel={progress === null ? "Creating…" : progress < 100 ? `Uploading ${progress}%` : "Saving…"}
      />
    </form>
    </ErrCtx>
  );
}

export function CreateLeadModal({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (lead: Lead) => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Create Lead" className={BIG}>
      <CreateLeadForm onClose={onClose} onCreate={onCreate} />
    </Modal>
  );
}

/* ---------- Edit Lead (1:7595) ---------- */
function EditLeadForm({ lead, onClose, onSaved }: { lead: Lead; onClose: () => void; onSaved: (lead: Lead) => void }) {
  const form = useRef<HTMLFormElement>(null);
  const { pending, errors, run, clearOnInput, toast } = useFormSubmit("Couldn't save the lead");
  return (
    <ErrCtx value={errors}>
    <form
      ref={form}
      noValidate
      onInput={clearOnInput}
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const savedPhone = lead.contact.phone ?? "";
        run(e.currentTarget, leadChecks(f, savedPhone), async () => {
          const body = leadBody(f);
          const phoneChanged = String(f.get("phone") ?? "") !== savedPhone; // untouched: left out, never rewritten
          // version: refused with 409 if someone else saved this lead since it was loaded.
          const saved = await api<Lead>(`/leads/${lead.id}`, {
            method: "PATCH",
            body: { ...body, contact: { ...body.contact, phone: phoneChanged ? body.contact.phone : undefined }, version: lead.version },
          });
          toast.success("Lead updated", `Changes to “${saved.title}” were saved.`);
          onSaved(saved);
        });
      }}
      className="flex flex-col gap-5"
    >
      <div className="flex flex-col gap-4">
        <LeadFieldsBlock
          lead={lead}
          contactRow={
            <Row>
              <Input label="Customer Name" name="customer" placeholder="eg, Praveen" initial={lead.contact.name} />
              <PhoneField initial={lead.contact.phone} />
              <Input label="EMail" name="email" type="email" placeholder="eg, asdfg@gmail.com" initial={lead.contact.email} />
            </Row>
          }
        />
      </div>
      <LogisticsFields lead={lead} />
      <SavedFiles lead={lead} />
      <ModalActions onCancel={onClose} onDone={() => form.current?.requestSubmit()} pending={pending} />
    </form>
    </ErrCtx>
  );
}

/** Files already on the lead (lists don't carry them, so the lead is fetched once when they are missing). */
function SavedFiles({ lead }: { lead: Lead }) {
  const fetched = useApi<Lead>(lead.attachments ? null : `/leads/${lead.id}`).data;
  const items = lead.attachments ?? fetched?.attachments;
  return (
    <div className="flex flex-col gap-1.5">
      <span className={FIELD_LABEL}>Attached Files</span>
      {items ? (
        <AttachmentList base={`/leads/${lead.id}`} items={items} />
      ) : (
        <Loading label="Loading the attached files…" className="flex flex-col gap-2">
          <Skeleton className="h-12 w-full rounded-[12px]" />
          <Skeleton className="h-12 w-2/3 rounded-[12px]" />
        </Loading>
      )}
    </div>
  );
}

export function EditLeadModal({ lead, onClose, onSaved }: { lead: Lead | null; onClose: () => void; onSaved: (lead: Lead) => void }) {
  return (
    <Modal open={lead !== null} onClose={onClose} title="Edit Lead" className={BIG}>
      {lead && <EditLeadForm key={lead.id} lead={lead} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

/** Delete wording shared by the table and pipeline (leads are soft-deleted server-side). */
export const leadRemoval = (l: Lead) => ({
  path: `/leads/${l.id}`,
  title: "Delete lead?",
  message: (
    <>
      The lead <b className="text-black">{l.title}</b> will be removed from the table and pipeline.
    </>
  ),
  confirmLabel: "Delete lead",
  success: "Lead deleted",
  successDetail: `“${l.title}” was removed.`,
  failTitle: "Couldn't delete the lead",
});

/* ---------- Schedule Follow Up Reminder (1:7664) / Assigned Lead To BDE (1:7691) ---------- */
type SmallFormProps = {
  title: string;
  open: boolean;
  onClose: () => void;
  failTitle: string;
  check: (f: FormData) => Record<string, string>;
  submit: (f: FormData, toast: ReturnType<typeof useToast>) => Promise<void>;
  children: ReactNode;
};

// The body lives inside <Modal>, so its errors and pending state reset every time the dialog opens.
function SmallFormBody({ onClose, failTitle, check, submit, children }: Omit<SmallFormProps, "title" | "open">) {
  const form = useRef<HTMLFormElement>(null);
  const { pending, errors, run, clearOnInput, toast } = useFormSubmit(failTitle);
  return (
    <ErrCtx value={errors}>
      <form
        ref={form}
        noValidate
        onInput={clearOnInput}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          run(e.currentTarget, check(f), async () => {
            await submit(f, toast);
            onClose();
          });
        }}
        className="flex flex-col gap-5"
      >
        <div className="flex flex-col gap-4">{children}</div>
        <ModalActions onCancel={onClose} onDone={() => form.current?.requestSubmit()} pending={pending} />
      </form>
    </ErrCtx>
  );
}

function SmallForm({ title, open, ...body }: SmallFormProps) {
  return (
    <Modal open={open} onClose={body.onClose} title={title} className="w-[520px]">
      <SmallFormBody {...body} />
    </Modal>
  );
}

function DueField() {
  const error = useErr("due");
  return (
    <Field label="Due date And Time" error={error} required>
      <TextInput name="due" type="datetime-local" aria-invalid={!!error} aria-required className="invalid:text-black/50" />
    </Field>
  );
}

// Stored on the lead; at its time the API notifies whoever scheduled it and the lead's owner (bell + Notifications).
export function ReminderModal({ leadId, open, onClose, onDone }: { leadId: string; open: boolean; onClose: () => void; onDone: () => void }) {
  return (
    <SmallForm
      title="Schedule Follow Up Reminder"
      open={open}
      onClose={onClose}
      failTitle="Couldn't schedule the reminder"
      check={(f) => {
        const e: Record<string, string> = {};
        const due = String(f.get("due") ?? "");
        if (!String(f.get("title") ?? "").trim()) e.title = "Enter a title";
        if (!due) e.due = "Pick a date and time";
        else if (new Date(due) <= new Date()) e.due = "Pick a time in the future";
        return e;
      }}
      submit={async (f, toast) => {
        const title = String(f.get("title") ?? "").trim();
        const dueAt = new Date(String(f.get("due"))).toISOString();
        await api(`/leads/${leadId}/reminders`, { method: "POST", body: { title, dueAt, notes: String(f.get("notes") ?? "") } });
        toast.success("Reminder scheduled", `“${title}” on ${dateTime(dueAt)}.`);
        onDone();
      }}
    >
      <Input label="Title" name="title" placeholder="eg., Custom" required />
      <DueField />
      <Area label="Notes" name="notes" />
    </SmallForm>
  );
}

export function AssignModal({ leadId, open, onClose, onAssigned }: { leadId: string; open: boolean; onClose: () => void; onAssigned: (lead: Lead) => void }) {
  const { users } = useLookups(open);
  return (
    <SmallForm
      title="Assigned Lead To BDE"
      open={open}
      onClose={onClose}
      failTitle="Couldn't assign the lead"
      check={(f): Record<string, string> => (f.get("ownerId") ? {} : { ownerId: "Select who should own this lead" })}
      submit={async (f, toast) => {
        const lead = await api<Lead>(`/leads/${leadId}/assign`, { method: "POST", body: { ownerId: f.get("ownerId") } });
        toast.success("Lead assigned", `“${lead.title}” is now owned by ${lead.owner?.name ?? "the selected user"}.`);
        onAssigned(lead);
      }}
    >
      <PickField label="BDE" name="ownerId" options={opts(users)} required />
    </SmallForm>
  );
}
