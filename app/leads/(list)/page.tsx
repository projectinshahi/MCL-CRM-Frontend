"use client";

import { useState } from "react";
import { useRemove } from "@/components/feedback";
import { SkeletonRows } from "@/components/skeletons";
import { Badge, EmptyState, IconButton, LoadFailed, Pagination } from "@/components/ui";
import { EditLeadModal, leadRemoval, type Lead } from "@/components/leads/LeadModals";
import { LeadTools, useLeads } from "@/components/leads/LeadsView";
import { cap, day, inr, paging, pastEnd, useApi, type List } from "@/lib/api";

// Leads- Table (Figma 1:6132): column widths 400/100/100/90/120/120/100/80/120 = 1230
const cell = "shrink-0 text-[16px] font-medium tracking-[-0.64px] text-black";

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
    <section className="flex min-w-0 flex-col gap-[10px] rounded-[22px] border border-stroke2 bg-primary px-5">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-3 pt-6 pb-5">
        <h2 className="text-[28px] font-medium text-black sm:w-[355px]">Leads</h2>
        <LeadTools />
      </div>

      <div className="overflow-x-auto">
        <div className="flex min-w-[1230px] flex-col gap-[10px]">
          <div className="flex items-center border-b border-stroke2 py-5 text-[16px] font-medium tracking-[-0.64px] text-nav *:shrink-0 *:opacity-80">
            <p className="min-w-[400px] flex-1">Title</p>
            <p className="w-[100px]">Source</p>
            <p className="w-[100px]">Stage</p>
            <p className="w-[90px]">Priority</p>
            <p className="w-[120px]">Value</p>
            <p className="w-[120px]">Payment</p>
            <p className="w-[100px]">Owner</p>
            <p className="w-20">Created Date</p>
            <p className="w-[120px] text-center">Actions</p>
          </div>

          {!leads.data && !leads.error && <SkeletonRows columns={["flex", 100, 100, 90, 120, 120, 100, 80, 120]} />}
          {!leads.data && leads.error && <LoadFailed what="leads" onRetry={leads.reload} />}
          {leads.data?.items.length === 0 && leads.data.page === page && <EmptyState>{query.q || query.sourceId || query.priority ? "No leads match your search or filters." : "No leads yet. Use Add Lead to create the first one."}</EmptyState>}
          {leads.data?.items.map((r) => (
            <div key={r.id} className="flex items-center border-b border-stroke2 pt-[10px] pb-4">
              <p className={`${cell} min-w-[400px] flex-1`}>{r.title}</p>
              <p className={`${cell} w-[100px]`}>{r.source?.name ?? "------"}</p>
              <div className="w-[100px] shrink-0">
                <Badge label={r.status.name} width={88} />
              </div>
              <div className="w-[90px] shrink-0">
                <Badge label={cap(r.priority)} width={76} />
              </div>
              <p className={`${cell} w-[120px]`}>{inr(r.expectedValue)}</p>
              <div className="w-[120px] shrink-0">
                <Badge label={cap(r.paymentStatus)} width={96} />
              </div>
              <p className={`${cell} w-[100px]`}>{r.owner?.name ?? "------"}</p>
              <p className="w-20 shrink-0 text-[16px] font-medium text-black">{day(r.createdAt)}</p>
              <div className="flex w-[120px] shrink-0 items-center justify-center gap-1">
                <IconButton icon="edit" label="Edit lead" onClick={() => setEditing(r)} className="h-[38px]!" />
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
