"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/Icon";
import { useToast } from "@/components/feedback";
import { useMe } from "@/components/Shell";
import { DetailSkeleton, SkeletonLines } from "@/components/skeletons";
import { Badge } from "@/components/ui";
import { AssignModal, EditLeadModal, ReminderModal, type Lead } from "@/components/leads/LeadModals";
import { AttachmentList } from "@/components/leads/Attachments";
import { ConvertLeadModal } from "@/components/leads/ConvertLead";
import { cap, dateTime, day, inr, useApi, type List } from "@/lib/api";
import { formatPhone } from "@/lib/phone";

const card = "flex min-w-0 flex-col gap-8 rounded-[16px] border border-stroke2 bg-primary px-5 py-8";
const title = "text-[24px] font-medium text-black sm:text-[28px]";
const btn = "flex shrink-0 items-center gap-2 rounded-[18px] border border-stroke2 bg-primary px-[17px] py-[13px] text-[16px] font-medium whitespace-nowrap text-nav";

function Info({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`flex min-w-0 flex-col gap-2 font-medium ${className}`}>
      <p className="text-[16px] tracking-[-0.64px] text-nav opacity-80">{label}</p>
      <p className="text-[20px] tracking-[-0.8px] break-words text-black">{children ?? "------"}</p>
    </div>
  );
}

function ContactItem({ icon, label, children }: { icon: IconName; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <Icon name={icon} className="text-nav" />
      <Info label={label} className="flex-1 xl:max-w-[300px]">
        {children}
      </Info>
    </div>
  );
}

type Activity = { id: string; type: string; text: string; actor: { name: string } | null; createdAt: string };

// Leads- Contact (Figma 1:6884), now for any lead: /leads/<id>.
export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [version, setVersion] = useState(0);
  const reload = () => setVersion((v) => v + 1);
  const lead = useApi<Lead>(`/leads/${id}`, undefined, version);
  const activity = useApi<List<Activity>>(`/leads/${id}/activities`, { pageSize: 50 }, version);
  const [modal, setModal] = useState<"reminder" | "assign" | "edit" | "convert" | null>(null);
  const toast = useToast();
  const close = () => setModal(null);
  const c = lead.data;
  const perms = useMe()?.permissions ?? [];
  const seesCustomers = perms.includes("customers"); // converting creates a customer: Leads and Customers access both needed

  // Only a lead that never loaded: a failed refresh keeps the page (its error is reported as a toast).
  if (lead.error && !c)
    return (
      <div className="flex flex-col items-start gap-4 p-4 sm:p-6">
        <p className="text-[18px] text-nav">{lead.error.status === 404 ? "This lead does not exist or is not assigned to you." : lead.error.message}</p>
        <Link href="/leads" className="font-semibold text-link hover:underline">
          Back to leads
        </Link>
      </div>
    );

  return (
    <div className="flex flex-col gap-[18px] p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/leads/pipeline" aria-label="Back to pipeline" className="flex size-[50px] items-center justify-center rounded-full border border-stroke2 bg-primary text-black">
          <Icon name="arrow-right" size={28} className="rotate-180" />
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button suppressHydrationWarning type="button" onClick={() => setModal("reminder")} className={`${btn} cursor-pointer`}>
            Reminder <Icon name="reminder" size={18} />
          </button>
          {/* Disqualify: rules not decided yet (report C2 / Q2) */}
          <button
            suppressHydrationWarning
            type="button"
            onClick={() => toast.info("Disqualify isn't available yet", "The rules for disqualifying a lead still need to be agreed.")}
            className={`${btn} cursor-pointer`}
          >
            Disqualify <Icon name="warning" size={18} />
          </button>
          <button suppressHydrationWarning type="button" onClick={() => setModal("assign")} className={`${btn} cursor-pointer`}>
            Assign <Icon name="assign" size={18} />
          </button>
          {/* Not before the lead has loaded: the form would open by itself when it arrived. */}
          <button suppressHydrationWarning type="button" onClick={() => setModal("edit")} disabled={!c} className={`${btn} cursor-pointer disabled:cursor-wait disabled:opacity-60`}>
            Edit <Icon name="edit" size={18} />
          </button>
          {c && seesCustomers && !c.customer && (
            <button suppressHydrationWarning type="button" onClick={() => setModal("convert")} className={`${btn} cursor-pointer`}>
              Convert to Customer <Icon name="converted" size={18} />
            </button>
          )}
          {c?.customer && seesCustomers && !c.customer.deleted && (
            <Link href={`/customers/${c.customer.id}`} className={btn}>
              View Customer <Icon name="user-square" size={18} />
            </Link>
          )}
        </div>
      </div>

      {!c && <DetailSkeleton />}
      {c && (
        <div className="flex flex-col gap-[18px] xl:flex-row xl:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-[18px]">
            <section className={card}>
              <div className="flex items-center justify-between gap-3 border-b border-stroke2 pb-5">
                <h1 className={title}>{c.title}</h1>
                <Badge label={c.status.name} width={88} />
              </div>
              <div className="flex flex-col gap-6">
                <div className="grid gap-6 sm:grid-cols-3 sm:gap-0">
                  <Info label="Source">{c.source?.name}</Info>
                  <Info label="Owner">{c.owner?.name}</Info>
                  <Info label="Stage">{c.status.name}</Info>
                </div>
                <div className="grid gap-6 sm:grid-cols-3 sm:gap-0">
                  <Info label="Priority">{cap(c.priority)}</Info>
                  <Info label="Value">{inr(c.expectedValue)}</Info>
                  <Info label="District">{c.district}</Info>
                </div>
                <div className="grid gap-6 border-b border-stroke2 pb-5 sm:grid-cols-3 sm:gap-0">
                  <Info label="Created Date">{day(c.createdAt)}</Info>
                  <Info label="Customer">
                    {!c.customer
                      ? "Not converted"
                      : c.customer.deleted
                        ? `${c.customer.name} (deleted)`
                        : seesCustomers
                          ? <Link href={`/customers/${c.customer.id}`} className="text-link hover:underline">{c.customer.name} ({c.customer.code})</Link>
                          : c.customer.name}
                    {c.convertedAt && <span className="block text-[14px] text-nav opacity-70">Converted {day(c.convertedAt)}</span>}
                  </Info>
                  <Info label="Last Update">{day(c.updatedAt)}</Info>
                </div>
              </div>
              <Info label="Description">{c.description}</Info>
            </section>

            <section className={card}>
              <div className="flex items-center gap-[14px] border-b border-stroke2 pb-5">
                <Icon name="activity" size={26} className="text-nav" />
                <h2 className={title}>Activity</h2>
              </div>
              {!activity.data && !activity.error && <SkeletonLines rows={3} />}
              {!activity.data && activity.error && (
                <p className="text-[16px] text-nav">
                  Couldn&apos;t load the activity.{" "}
                  <button suppressHydrationWarning type="button" onClick={activity.reload} className="cursor-pointer font-semibold text-link hover:underline">
                    Try again
                  </button>
                </p>
              )}
              <ul className="flex flex-col gap-6">
                {activity.data?.items.map((a) => (
                  <li key={a.id} className="flex flex-col gap-1">
                    <p className="flex items-start gap-2 text-[18px] font-medium tracking-[-0.72px] text-black">
                      <span className="mt-[6px] size-[10px] shrink-0 rounded-full bg-button" />
                      {a.text}
                    </p>
                    <p className="pl-5 text-[14px] tracking-[-0.56px] text-nav opacity-70">
                      {dateTime(a.createdAt)}
                      {a.actor && ` · ${a.actor.name}`}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <div className="flex min-w-0 flex-col gap-[18px] xl:w-[382px] xl:shrink-0">
          <section className={card}>
            <h2 className={`${title} border-b border-stroke2 pb-5`}>Contact Information</h2>
            <div className="flex flex-col gap-6">
              <ContactItem icon="user-square" label="Contact Name">
                {c.contact.name}
              </ContactItem>
              <ContactItem icon="call" label="Phone Number">
                {c.contact.phone && formatPhone(c.contact.phone)}
              </ContactItem>
              <ContactItem icon="mail" label="EMail">
                {c.contact.email}
              </ContactItem>
              <ContactItem icon="location" label="Address">
                {c.address}
              </ContactItem>
            </div>
          </section>
          <section className={card}>
            <h2 className={`${title} border-b border-stroke2 pb-5`}>Attachments</h2>
            <AttachmentList base={`/leads/${c.id}`} items={c.attachments ?? []} />
          </section>
          </div>
        </div>
      )}

      <ReminderModal leadId={id} open={modal === "reminder"} onClose={close} onDone={reload} />
      <AssignModal leadId={id} open={modal === "assign"} onClose={close} onAssigned={reload} />
      <ConvertLeadModal
        lead={modal === "convert" ? c : null}
        onClose={close}
        onConverted={() => {
          close();
          reload(); // the lead's new stage, its customer link and the "converted" activity
        }}
      />
      <EditLeadModal
        lead={modal === "edit" ? c : null}
        onClose={close}
        onSaved={() => {
          close();
          reload();
        }}
      />
    </div>
  );
}
