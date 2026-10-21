"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useToast } from "@/components/feedback";
import { Loading, Skeleton } from "@/components/skeletons";
import { Modal, ModalActions } from "@/components/ui";
import { typeLabel, type Customer } from "@/components/customers/CustomerModals";
import type { Lead, Ref } from "@/components/leads/LeadModals";
import { api, ApiError, useApi } from "@/lib/api";
import { formatPhone } from "@/lib/phone";

type Proposed = Pick<Customer, "name" | "company" | "phone" | "email" | "address" | "district" | "companyLocation" | "companyEmail" | "type" | "source" | "assignee">;
type Match = Customer & { matchedOn: ("email" | "phone" | "company")[] };
type Converted = { alreadyConverted: true; created: false; customer: Customer; lead: Lead };
type Preview = Converted | { alreadyConverted: false; customer: Proposed; missing: string[]; matches: Match[]; moveTo: Ref | null };
export type ConvertResult = { created: boolean; alreadyConverted: boolean; customer: Customer; lead: Lead };

const REASON = { email: "Same email", phone: "Same phone", company: "Same company" };
const NEW = "new";

function Value({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-[12px] font-medium text-nav opacity-80">{label}</dt>
      <dd className={`text-[14px] font-medium break-words ${children ? "text-black" : "text-nav opacity-60"}`}>{children || "Not provided"}</dd>
    </div>
  );
}

function ConvertBody({ lead, onClose, onConverted }: { lead: Lead; onClose: () => void; onConverted: (r: ConvertResult) => void }) {
  const [refresh, setRefresh] = useState(0);
  const preview = useApi<Preview>(`/leads/${lead.id}/conversion`, undefined, refresh);
  const [choice, setChoice] = useState<string | null>(null); // an existing customer's id, or NEW
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const toast = useToast();
  const p = preview.data;

  if (preview.error && !p)
    return (
      <div className="flex flex-col gap-6">
        <p role="alert" className="text-[14px] text-danger">
          {preview.error.message}
        </p>
        <ModalActions onCancel={onClose} onDone={onClose} doneLabel="Close" />
      </div>
    );
  if (!p)
    return (
      <Loading label="Loading the lead’s details…" className="flex flex-col gap-6">
        <Skeleton className="h-5 w-4/5" />
        <div className="grid gap-3 rounded-[14px] border border-stroke2 bg-bg5 p-4 sm:grid-cols-2">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-36" />
            </div>
          ))}
        </div>
      </Loading>
    );
  if (p.alreadyConverted)
    return (
      <div className="flex flex-col gap-5">
        <p className="text-[14px] text-black">
          “{lead.title}” is already linked to the customer{" "}
          <Link href={`/customers/${p.customer.id}`} className="font-semibold text-link hover:underline">
            {p.customer.name}
          </Link>
          .
        </p>
        <ModalActions onCancel={onClose} onDone={() => onConverted(p)} doneLabel="Close" />
      </div>
    );

  const c = p.customer;
  const decide = p.matches.length > 0; // the user must pick a match or confirm a new customer
  const linking = !!choice && choice !== NEW;
  const pick = (id: string) => {
    setChoice(id);
    setProblem(null);
  };
  const nameless = p.missing.includes("name") ? "This lead has no contact name or company name to name the customer. Add one with Edit Lead, then convert it." : null;

  const convert = async () => {
    if (pending) return;
    if (nameless) return setProblem(nameless);
    if (decide && !choice) return setProblem("Choose the matching customer, or create a new one.");
    setProblem(null);
    setPending(true);
    try {
      const r = await api<ConvertResult>(`/leads/${lead.id}/convert`, { method: "POST", body: linking ? { customerId: choice } : { createNew: decide } });
      if (r.alreadyConverted) toast.info("Already converted", `“${lead.title}” is linked to ${r.customer.name}.`);
      else if (r.created) toast.success("Lead converted", `${r.customer.name} (${r.customer.code}) was added to Customers.`);
      else toast.success("Lead converted", `“${lead.title}” is now linked to ${r.customer.name}.`);
      onConverted(r);
    } catch (err) {
      if (err instanceof ApiError && err.code === "POSSIBLE_DUPLICATE") {
        setChoice(null);
        setProblem("A matching customer appeared in the meantime. Choose it below, or create a new customer.");
        setRefresh((n) => n + 1);
      } else toast.apiError(err, "Couldn't convert the lead");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[14px] text-nav">
        {linking
          ? "The lead is linked to the customer you chose, whose details stay as they are."
          : "A customer is created from this lead’s details below."}{" "}
        The lead stays in Leads with its history{p.moveTo && <>, and moves to {p.moveTo.name}</>}.
      </p>

      <dl className="grid gap-3 rounded-[14px] border border-stroke2 bg-bg5 p-4 sm:grid-cols-2">
        <Value label="Customer Name">{c.name}</Value>
        <Value label="Customer Type">{typeLabel(c.type)}</Value>
        <Value label="Phone Number">{c.phone && formatPhone(c.phone)}</Value>
        <Value label="EMail">{c.email}</Value>
        <Value label="Company Name">{c.company}</Value>
        <Value label="Company Location">{c.companyLocation}</Value>
        <Value label="Company EMail">{c.companyEmail}</Value>
        <Value label="District">{c.district}</Value>
        <Value label="Address">{c.address}</Value>
        <Value label="Source">{c.source?.name}</Value>
        <Value label="Assigned User">{c.assignee?.name}</Value>
      </dl>
      <p className="-mt-2 text-[13px] text-nav opacity-80">
        The description, value, shipment details and files stay on the lead and are shown on the customer’s page.
      </p>

      {decide && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[15px] font-semibold text-black">Possible existing customers</legend>
          {p.matches.map((m) => (
            <label key={m.id} className={`flex cursor-pointer items-start gap-3 rounded-[12px] border p-3 ${choice === m.id ? "border-button bg-bg5" : "border-stroke2"}`}>
              <input type="radio" name="match" value={m.id} checked={choice === m.id} onChange={() => pick(m.id)} className="mt-0.5 size-4 accent-button" />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-[14px] font-medium text-black">
                  Link to {m.name}
                  {m.company && <span className="text-nav"> · {m.company}</span>}
                </span>
                <span className="text-[13px] break-words text-nav">{[m.email, m.phone && formatPhone(m.phone)].filter(Boolean).join(" · ") || "No email or phone"}</span>
                <span className="flex flex-wrap gap-1">
                  {m.matchedOn.map((r) => (
                    <span key={r} className="rounded-full bg-stroke px-2 py-0.5 text-[11px] font-medium text-black dark:text-bg5">
                      {REASON[r]}
                    </span>
                  ))}
                </span>
              </span>
            </label>
          ))}
          <label className={`flex cursor-pointer items-start gap-3 rounded-[12px] border p-3 ${choice === NEW ? "border-button bg-bg5" : "border-stroke2"}`}>
            <input type="radio" name="match" value={NEW} checked={choice === NEW} onChange={() => pick(NEW)} className="mt-0.5 size-4 accent-button" />
            <span className="flex flex-col gap-1">
              <span className="text-[14px] font-medium text-black">Create a new customer</span>
              <span className="text-[13px] text-nav">This is a different customer{p.matches.length ? " from the ones above" : ""}.</span>
            </span>
          </label>
        </fieldset>
      )}

      {(problem ?? nameless) && (
        <p role="alert" className="rounded-[12px] border border-danger/40 bg-danger/5 px-3.5 py-2.5 text-[13px] text-danger">
          {problem ?? nameless}
        </p>
      )}
      <ModalActions
        onCancel={onClose}
        onDone={convert}
        pending={pending}
        doneLabel={linking ? "Link to Customer" : "Convert to Customer"}
        pendingLabel="Converting…"
      />
    </div>
  );
}

/** Lead → customer: creates the customer (or links an existing one) once the server confirms. */
export function ConvertLeadModal({ lead, onClose, onConverted }: { lead: Lead | null; onClose: () => void; onConverted: (r: ConvertResult) => void }) {
  return (
    <Modal open={lead !== null} onClose={onClose} title="Convert to Customer" className="w-[640px]">
      {lead && <ConvertBody key={lead.id} lead={lead} onClose={onClose} onConverted={onConverted} />}
    </Modal>
  );
}
