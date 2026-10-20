"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useId, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/Icon";
import { useConfirm, useToast } from "@/components/feedback";
import { DetailSkeleton, SkeletonLines } from "@/components/skeletons";
import { Badge, Field, Spinner } from "@/components/ui";
import { ActivityModal, activityLabel, CustomerEditModal, typeLabel, useCustomerStatus, type Customer, type CustomerActivity } from "@/components/customers/CustomerModals";
import { AttachmentList, AttachmentPicker, type Attachment } from "@/components/leads/Attachments";
import type { Lead } from "@/components/leads/LeadModals";
import { api, cap, dateTime, day, fieldErrors, inr, upload, useApi, type List } from "@/lib/api";
import type { Picked } from "@/lib/attachments";
import { formatPhone } from "@/lib/phone";

// Same cards and type scale as the lead's page (Leads- Contact, Figma 1:6884).
const card = "flex min-w-0 flex-col gap-8 rounded-[16px] border border-stroke2 bg-primary px-5 py-8";
const title = "text-[24px] font-medium text-black sm:text-[28px]";
const btn = "flex shrink-0 items-center gap-2 rounded-[18px] border border-stroke2 bg-primary px-[17px] py-[13px] text-[16px] font-medium whitespace-nowrap text-nav";
const small = "flex cursor-pointer items-center gap-2 rounded-[12px] border border-stroke2 bg-bg5 px-3 py-2 text-[14px] font-medium text-nav transition-colors hover:bg-[rgb(71_215_251/0.2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-wait disabled:opacity-60";

type Detail = Customer & { attachments: Attachment[]; leads: Lead[]; hiddenLeads: number };
type LeadActivity = { id: string; type: string; text: string; actor: { name: string } | null; createdAt: string };

/** A labelled value; anything not collected says so instead of showing a placeholder that looks like data. */
function Info({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  const empty = children === null || children === undefined || children === false || children === "";
  return (
    <div className={`flex min-w-0 flex-col gap-2 font-medium ${className}`}>
      <p className="text-[16px] tracking-[-0.64px] text-nav opacity-80">{label}</p>
      <p className={`tracking-[-0.8px] break-words ${empty ? "text-[18px] text-nav opacity-60" : "text-[20px] text-black"}`}>{empty ? "Not provided" : children}</p>
    </div>
  );
}

function Item({ icon, label, children }: { icon: IconName; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <Icon name={icon} className="shrink-0 text-nav" />
      <Info label={label} className="flex-1">
        {children}
      </Info>
    </div>
  );
}

function Heading({ icon, children, action }: { icon?: IconName; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-[14px] border-b border-stroke2 pb-5">
      {icon && <Icon name={icon} size={26} className="text-nav" />}
      <h2 className={`${title} flex-1`}>{children}</h2>
      {action}
    </div>
  );
}

/** The original lead's own history (its activity log), read from the lead; opened on demand. */
function LeadHistory({ leadId }: { leadId: string }) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  const history = useApi<List<LeadActivity>>(open ? `/leads/${leadId}/activities` : null, { pageSize: 50 });
  return (
    <div className="flex flex-col gap-3">
      <button suppressHydrationWarning type="button" aria-expanded={open} aria-controls={panel} onClick={() => setOpen(!open)} className={`${small} w-fit`}>
        <Icon name="activity" size={18} />
        {open ? "Hide lead history" : "Show lead history"}
      </button>
      {open && (
        <ul id={panel} className="flex flex-col gap-4 border-l-2 border-stroke2 pl-4">
          {!history.data && !history.error && (
            <li>
              <SkeletonLines rows={2} className="flex flex-col gap-4" />
            </li>
          )}
          {!history.data && history.error && (
            <li className="text-[14px] text-nav">
              Couldn&apos;t load the lead history.{" "}
              <button suppressHydrationWarning type="button" onClick={history.reload} className="cursor-pointer font-semibold text-link hover:underline">
                Try again
              </button>
            </li>
          )}
          {history.data?.items.map((a) => (
            <li key={a.id} className="flex flex-col gap-[2px]">
              <span className="text-[16px] font-medium text-black">{a.text}</span>
              <span className="text-[14px] text-nav opacity-80">
                {dateTime(a.createdAt)}
                {a.actor && ` · ${a.actor.name}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A lead converted into this customer: its deal, shipment and files, read from the lead itself (never copied). */
function ConvertedLead({ lead: l, original }: { lead: Lead; original: boolean }) {
  const s = l.shipment;
  return (
    <article className="flex flex-col gap-6 border-b border-stroke2 pb-8 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          {original && <span className="w-fit rounded-[10px] bg-stroke px-2 py-[2px] text-[12px] font-semibold text-black dark:text-bg5">Original lead</span>}
          <Link href={`/leads/${l.id}`} className="text-[20px] font-medium break-words text-black hover:text-link hover:underline">
            {l.title}
          </Link>
          <span className="text-[14px] text-nav opacity-80" title={l.id}>
            Lead ref. {l.id.slice(0, 8)} · created {day(l.createdAt)}
          </span>
        </div>
        <Badge label={l.status.name} width={88} />
      </div>
      <div className="grid gap-6 sm:grid-cols-3 sm:gap-x-4">
        <Info label="Value">{l.expectedValue != null && inr(l.expectedValue)}</Info>
        <Info label="Priority">{cap(l.priority)}</Info>
        <Info label="Converted">{l.convertedAt && day(l.convertedAt)}</Info>
        <Info label="Shipment Type">{s.shipmentType && cap(s.shipmentType)}</Info>
        <Info label="Destination Country">{s.destinationCountry}</Info>
        <Info label="Commodity">{s.commodity}</Info>
        <Info label="Weight">{s.weightKg != null && `${s.weightKg} kg`}</Info>
        <Info label="Shipment Volume">{s.volume}</Info>
        <Info label="Pickup Location">{s.pickupLocation}</Info>
        <Info label="Delivery Location">{s.deliveryLocation}</Info>
      </div>
      <Info label="Description">{l.description}</Info>
      <div className="flex flex-col gap-2">
        <p className="text-[16px] font-medium tracking-[-0.64px] text-nav opacity-80">Lead files</p>
        <AttachmentList base={`/leads/${l.id}`} items={l.attachments ?? []} />
      </div>
      {original && <LeadHistory leadId={l.id} />}
    </article>
  );
}

/** The customer's own files: upload (compressed photos, progress, safe retries), download, remove. */
// onChange takes an update of the latest list: an upload can finish while a removal is being confirmed.
function CustomerFiles({ customer: c, onChange }: { customer: Detail; onChange: (update: (items: Attachment[]) => Attachment[]) => void }) {
  const pickerId = useId();
  const toast = useToast();
  const confirm = useConfirm();
  const [picked, setPicked] = useState<Picked[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [problem, setProblem] = useState<string>();
  const [removing, setRemoving] = useState<string | null>(null);
  const ids = useRef(new Map<string, string>()); // one id per chosen file, kept for retries: never saved twice
  const idFor = (key: string) => ids.current.get(key) ?? ids.current.set(key, crypto.randomUUID()).get(key)!;

  const send = async () => {
    if (progress !== null) return;
    if (!picked.length) return setProblem("Choose at least one file.");
    if (picked.some((p) => p.preparing)) return setProblem("Wait until the files have finished compressing.");
    if (picked.some((p) => p.error)) return setProblem("Remove the files marked in red, or replace them, before uploading.");
    setProblem(undefined);
    const form = new FormData();
    form.append("ids", JSON.stringify(picked.map((p) => idFor(p.key))));
    form.append("originalSizes", JSON.stringify(picked.map((p) => p.originalSize)));
    for (const p of picked) form.append("files", p.file, p.file.name);
    setProgress(0);
    try {
      const r = await upload<{ items: Attachment[] }>(`/customers/${c.id}/attachments`, form, setProgress);
      toast.success("Files uploaded", `${picked.length} file${picked.length === 1 ? "" : "s"} added to ${c.name}.`);
      setPicked([]);
      ids.current.clear();
      onChange(() => r.items);
    } catch (err) {
      setProblem(fieldErrors(err).attachments);
      toast.apiError(err, "Couldn't upload the files");
    } finally {
      setProgress(null);
    }
  };

  const remove = async (a: Attachment) => {
    if (removing || !(await confirm({ title: "Remove file?", message: <>The file <b className="text-black">{a.fileName}</b> will be removed from this customer.</>, confirmLabel: "Remove file", danger: true })))
      return;
    setRemoving(a.id);
    try {
      await api(`/customers/${c.id}/attachments/${a.id}`, { method: "DELETE" });
      toast.success("File removed", `“${a.fileName}” was removed.`);
      onChange((items) => items.filter((x) => x.id !== a.id));
    } catch (err) {
      toast.apiError(err, "Couldn't remove the file");
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <AttachmentList base={`/customers/${c.id}`} items={c.attachments} onRemove={remove} removing={removing} />
      <Field label="Add files" htmlFor={pickerId} error={problem}>
        <AttachmentPicker id={pickerId} items={picked} setItems={setPicked} disabled={progress !== null} />
      </Field>
      {picked.length > 0 && (
        <button suppressHydrationWarning type="button" onClick={send} disabled={progress !== null} aria-busy={progress !== null} className="flex h-10 w-fit cursor-pointer items-center gap-2 rounded-[12px] bg-button px-4 text-[16px] font-medium text-white transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-wait disabled:opacity-80">
          {progress !== null && <Spinner />}
          {progress === null ? `Upload ${picked.length} file${picked.length === 1 ? "" : "s"}` : progress < 100 ? `Uploading ${progress}%` : "Saving…"}
        </button>
      )}
      <p className="text-[14px] text-nav opacity-80">Files of the original lead stay with that lead and are listed under it, with the lead’s access rules.</p>
    </div>
  );
}

/** `list` is loaded by the page, alongside the customer (not after it: that was a second wait of ~1 s). */
function Activities({ customerId, list }: { customerId: string; list: ReturnType<typeof useApi<List<CustomerActivity>>> }) {
  const [adding, setAdding] = useState(false);
  return (
    <section className={card}>
      <Heading
        icon="activity"
        action={
          <button suppressHydrationWarning type="button" onClick={() => setAdding(true)} className={small}>
            <Icon name="add" size={18} /> Add Activity
          </button>
        }
      >
        Activities
      </Heading>
      {!list.data && !list.error && <SkeletonLines rows={3} />}
      {list.error && !list.data && (
        <p className="text-[16px] text-nav">
          Couldn’t load the activities.{" "}
          <button suppressHydrationWarning type="button" onClick={list.reload} className="cursor-pointer font-semibold text-link hover:underline">
            Try again
          </button>
        </p>
      )}
      {list.data?.items.length === 0 && <p className="text-[16px] text-nav opacity-70">No activities yet. Use Add Activity to record an Initial contact, a Follow Up or a Call.</p>}
      {!!list.data?.items.length && (
        <ol className="flex flex-col gap-6">
          {list.data.items.map((a) => (
            <li key={a.id} className="flex flex-col gap-1">
              <p className="flex flex-wrap items-center gap-2 text-[18px] font-medium tracking-[-0.72px] text-black">
                <span className="rounded-[10px] bg-stroke px-2 py-[2px] text-[12px] font-semibold text-black dark:text-bg5">{activityLabel(a.type)}</span>
                {dateTime(a.occurredAt)}
              </p>
              {a.notes && <p className="text-[16px] break-words whitespace-pre-line text-black">{a.notes}</p>}
              <p className="text-[14px] text-nav opacity-70">Recorded by {a.actor.name}</p>
            </li>
          ))}
        </ol>
      )}
      <ActivityModal
        customerId={customerId}
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={() => {
          setAdding(false);
          list.reload();
        }}
      />
    </section>
  );
}

// Customer details: /customers/<id>. Only customers the user may see (others answer 404 from the API).
export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const customer = useApi<Detail>(`/customers/${id}`);
  const activities = useApi<List<CustomerActivity>>(`/customers/${id}/activities`, { pageSize: 50 });
  const [editing, setEditing] = useState(false);
  const status = useCustomerStatus((saved) => customer.mutate((d) => ({ ...d, ...saved })));
  const c = customer.data;

  if (customer.error && !c)
    return (
      <div className="flex flex-col items-start gap-4 p-4 sm:p-6">
        <p className="text-[18px] text-nav">{customer.error.status === 404 ? "This customer does not exist or is not assigned to you." : customer.error.message}</p>
        <Link href="/customers" className="font-semibold text-link hover:underline">
          Back to customers
        </Link>
      </div>
    );

  return (
    <div className="flex flex-col gap-[18px] p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/customers" aria-label="Back to customers" className="flex size-[50px] items-center justify-center rounded-full border border-stroke2 bg-primary text-black">
          <Icon name="arrow-right" size={28} className="rotate-180" />
        </Link>
        {c && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {/* Customers are deactivated, never deleted (Sprint 3). */}
            <button suppressHydrationWarning type="button" onClick={() => status.toggle(c)} disabled={status.busy === c.id} className={`${btn} cursor-pointer disabled:cursor-wait disabled:opacity-60`}>
              {status.busy === c.id && <Spinner />}
              {c.status === "active" ? "Deactivate" : "Activate"}
            </button>
            <button suppressHydrationWarning type="button" onClick={() => setEditing(true)} className={`${btn} cursor-pointer`}>
              Edit <Icon name="edit" size={18} />
            </button>
          </div>
        )}
      </div>

      {!c && <DetailSkeleton />}
      {c && (
        <div className="flex flex-col gap-[18px] xl:flex-row xl:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-[18px]">
            <section className={card}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stroke2 pb-5">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-[16px] font-semibold tracking-[-0.32px] text-selected">{c.code}</span>
                  <h1 className={`${title} break-words`}>{c.name}</h1>
                </div>
                <Badge label={cap(c.status)} width={80} />
              </div>
              <div className="grid gap-6 sm:grid-cols-3 sm:gap-x-4">
                <Info label="Customer Type">{typeLabel(c.type)}</Info>
                <Info label="Source">{c.source?.name}</Info>
                <Info label="Assigned User">{c.assignee?.name}</Info>
                <Info label="Created Date">{day(c.createdAt)}</Info>
                <Info label="Last Update">{day(c.updatedAt)}</Info>
              </div>
              <Info label="Note">{c.note}</Info>
            </section>

            <Activities customerId={c.id} list={activities} />

            <section className={card}>
              <Heading icon="converted">Converted Leads</Heading>
              {c.leads.map((l) => (
                <ConvertedLead key={l.id} lead={l} original={l.id === c.leadId} />
              ))}
              {!c.leads.length && !c.hiddenLeads && <p className="text-[16px] text-nav opacity-70">No leads are linked to this customer.</p>}
              {c.hiddenLeads > 0 && (
                <p className="text-[16px] text-nav opacity-70">
                  {c.hiddenLeads === 1 ? "1 linked lead isn’t" : `${c.hiddenLeads} linked leads aren’t`} shown: you don’t have access to {c.hiddenLeads === 1 ? "it" : "them"}.
                </p>
              )}
            </section>
          </div>

          <div className="flex min-w-0 flex-col gap-[18px] xl:w-[382px] xl:shrink-0">
            <section className={card}>
              <Heading>Contact Information</Heading>
              <div className="flex flex-col gap-6">
                <Item icon="call" label="Phone Number">
                  {c.phone && formatPhone(c.phone)}
                </Item>
                <Item icon="mail" label="EMail">
                  {c.email}
                </Item>
                <Item icon="location" label="Address">
                  {c.address}
                </Item>
                <Item icon="location" label="District">
                  {c.district}
                </Item>
              </div>
            </section>
            <section className={card}>
              <Heading>Company</Heading>
              <div className="flex flex-col gap-6">
                <Item icon="user-square" label="Company Name">
                  {c.company}
                </Item>
                <Item icon="global" label="Company Location">
                  {c.companyLocation}
                </Item>
                <Item icon="mail" label="Company EMail">
                  {c.companyEmail}
                </Item>
              </div>
            </section>
            <section className={card}>
              <Heading icon="note">Files</Heading>
              <CustomerFiles customer={c} onChange={(update) => customer.mutate((d) => ({ ...d, attachments: update(d.attachments) }))} />
            </section>
          </div>
        </div>
      )}

      <CustomerEditModal
        customer={editing && c ? c : null}
        onClose={() => setEditing(false)}
        onSaved={(saved) => {
          setEditing(false);
          customer.mutate((d) => ({ ...d, ...saved })); // the save's reply is the edited customer: no reload
        }}
      />
    </div>
  );
}
