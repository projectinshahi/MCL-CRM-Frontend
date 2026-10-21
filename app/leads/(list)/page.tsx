"use client";

import Link from "next/link";
import { useState } from "react";
import { useRemove } from "@/components/feedback";
import { SkeletonRows } from "@/components/skeletons";
import { Badge, EmptyState, IconButton, LoadFailed, Pagination, StageBadge } from "@/components/ui";
import { EditLeadModal, leadRemoval, type Lead } from "@/components/leads/LeadModals";
import { LeadTools, useLeads } from "@/components/leads/LeadsView";
import { cap, day, inr, paging, pastEnd, useApi, type List } from "@/lib/api";

// Leads- Table (Figma 1:6132), at the app's 14px table text.
const cell = "shrink-0 text-[14px] font-medium break-words text-black";

export default function LeadsTablePage() {
  const { query, version, refresh } = useLeads();
  // A new search or filter starts again at page 1.
  const key = JSON.stringify(query);
  const [paged, setPaged] = useState({ key, page: 1 });
  const page = paged.key === key ? paged.page : 1;
  const setPage = (p: number) => setPaged({ key, page: p });
  const [editing, setEditing] = useState<Lead | null>(null);
  const leads = useApi<List<Lead>>("/leads", { ...query, page }, version);
  const back = pastEnd(leads.data, page); // the last lead on the last page was deleted
  if (back) setPage(back);

  const { remove, removing } = useRemove(refresh);

  return (
    <section className="flex min-w-0 flex-col rounded-[16px] border border-stroke2 bg-primary px-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-3 py-4">
        <h2 className="text-[18px] font-semibold tracking-[-0.36px] text-black">Leads</h2>
        <LeadTools />
      </div>

      {/* Columns fit beside the sidebar from 1366px (the Figma widths ran past it and cut off the dates and actions);
          narrower screens scroll sideways with the title kept in view. */}
      <div className="table-scroll">
        <div className="flex min-w-[980px] flex-col">
          <div className="flex items-center border-b border-stroke2 py-3 text-[13px] font-medium text-nav/80 *:shrink-0">
            <p className="sticky left-0 z-[1] min-w-[160px] flex-1 bg-primary pr-4 sm:min-w-[200px]">Title</p>
            <p className="w-[96px]">Source</p>
            <p className="w-[112px]">Stage</p>
            <p className="w-[80px]">Priority</p>
            <p className="w-[100px]">Value</p>
            <p className="w-[96px]">Payment</p>
            <p className="w-[120px]">Owner</p>
            <p className="w-[88px]">Created</p>
            <p className="w-[88px] text-center">Actions</p>
          </div>

          {!leads.data && !leads.error && <SkeletonRows columns={["flex", 96, 112, 80, 100, 96, 120, 88, 88]} />}
          {!leads.data && leads.error && <LoadFailed what="leads" onRetry={leads.reload} />}
          {leads.data?.items.length === 0 && leads.data.page === page && <EmptyState>{query.q || query.sourceId || query.priority ? "No leads match your search or filters." : "No leads yet. Use Add Lead to create the first one."}</EmptyState>}
          {leads.data?.items.map((r) => (
            <div key={r.id} className="flex items-center border-b border-stroke2 py-2.5">
              <p className={`${cell} sticky left-0 z-[1] flex min-w-[160px] flex-1 items-center self-stretch bg-primary pr-4 sm:min-w-[200px]`}>
                <Link href={`/leads/${r.id}`} className="hover:text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                  {r.title}
                </Link>
              </p>
              <p className={`${cell} w-[96px] pr-2`}>{r.source?.name ?? "------"}</p>
              <div className="w-[112px] shrink-0 pr-2">
                <StageBadge status={r.status} width={80} />
              </div>
              <div className="w-[80px] shrink-0">
                <Badge label={cap(r.priority)} width={64} />
              </div>
              <p className={`${cell} w-[100px]`}>{inr(r.expectedValue)}</p>
              <div className="w-[96px] shrink-0">
                <Badge label={cap(r.paymentStatus)} width={80} />
              </div>
              <p className={`${cell} w-[120px] pr-2`}>{r.owner?.name ?? "------"}</p>
              <p className={`${cell} w-[88px]`}>{day(r.createdAt)}</p>
              <div className="flex w-[88px] shrink-0 items-center justify-center gap-1">
                <IconButton icon="edit" label="Edit lead" onClick={() => setEditing(r)} />
                <IconButton icon="delete" label="Delete lead" onClick={() => remove(r.id, leadRemoval(r))} disabled={removing === r.id} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <Pagination {...paging(leads.data, "Leads", setPage)} />

      <EditLeadModal
        lead={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          refresh();
        }}
      />
    </section>
  );
}
