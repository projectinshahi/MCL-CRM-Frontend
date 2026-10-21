"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { useReport } from "@/components/feedback";
import { useMe } from "@/components/Shell";
import { SkeletonRows, SubtitleSkeleton } from "@/components/skeletons";
import { activeFilters, Badge, col, EmptyState, FilterMenu, IconButton, LoadFailed, PageHeader, Pagination, Popover, SearchBox, Spinner, ToolButton, type FilterGroup } from "@/components/ui";
import { CUSTOMER_TYPES, CustomerEditModal, STATUSES, typeLabel, useCustomerStatus, type Customer } from "@/components/customers/CustomerModals";
import { useLookups } from "@/components/leads/LeadModals";
import { cap, day, paging, useApi, useDebounced, type List } from "@/lib/api";
import { formatPhone } from "@/lib/phone";

type Filter = { status: string; type: string; sourceId: string; assignedUserId: string; created: string };
const NO_FILTER: Filter = { status: "", type: "", sourceId: "", assignedUserId: "", created: "" };
const CREATED = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];
/** "30" → the India date 30 days ago (the API's createdFrom). */
const daysAgo = (n: string) => (n ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(Date.now() - Number(n) * 86_400_000) : undefined);

// Figma 1:6831 header row (+ Customer ID, Sprint 3): [label, width], narrowed from the Figma's 1906px to 14px text.
// Total + the 128px actions = 1608 = table min-width; ID and name stay in view while it scrolls sideways. On a screen
// wider than that, every column but the ID (the name is pinned 96px in) shares the spare width, so rows reach the
// card's edge.
const COLS = [
  ["Customer ID", 96], ["Customer Name", 160], ["Company", 140], ["Phone Number", 128], ["EMail", 180], ["Address", 160],
  ["Customer\nType", 88], ["Source", 104], ["Assigned User", 128], ["Status", 88], ["Created\nDate", 88], ["Note", 120],
] as const;

const cell = "shrink-0 text-[14px] font-medium break-words text-black";
const dash = (v: string | null | undefined) => v || "------";
const pill =
  "flex h-8 w-[84px] cursor-pointer items-center justify-center gap-1 rounded-[10px] border border-stroke2 bg-bg5 text-[13px] font-medium text-nav transition-colors hover:bg-[rgb(71_215_251/0.2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-wait disabled:opacity-60";

export default function CustomersPage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>(NO_FILTER);
  const [page, setPage] = useState(1);
  // A new search starts again at page 1 when it is sent: resetting on the first key fetched page 1 of the old search.
  const q = useDebounced(query);
  const [searched, setSearched] = useState(q);
  if (searched !== q) {
    setSearched(q);
    setPage(1);
  }
  const { created, ...rest } = filter;
  const customers = useApi<List<Customer> & { activeCount: number }>("/customers", { q, ...rest, createdFrom: daysAgo(created), page });
  const [editing, setEditing] = useState<Customer | null>(null);
  const filterBtn = useRef<HTMLButtonElement>(null);
  const [filtering, setFiltering] = useState(false);
  const closeFilter = useCallback(() => setFiltering(false), []);
  const filtered = !!query || Object.values(filter).some(Boolean);
  const seesAll = !!useMe()?.permissions.includes("all_records");
  const { sources, users } = useLookups(filtering);

  const report = useReport("/customers/export", "Customers report");
  // A saved customer changes its row in place; the active count follows a status change.
  const replace = (saved: Customer) =>
    customers.mutate((list) => {
      const before = list.items.find((x) => x.id === saved.id);
      const delta = (saved.status === "active" ? 1 : 0) - (before?.status === "active" ? 1 : 0);
      return { ...list, items: list.items.map((x) => (x.id === saved.id ? saved : x)), activeCount: list.activeCount + delta };
    });
  const status = useCustomerStatus(replace);

  const groups: FilterGroup[] = [
    { key: "status", label: "Status", options: STATUSES },
    { key: "type", label: "Type", options: CUSTOMER_TYPES },
    { key: "sourceId", label: "Sources", options: sources.map((s) => ({ value: s.id, label: s.name })) },
    // Only roles that see every customer have anyone else's to filter by.
    ...(seesAll ? [{ key: "assignedUserId", label: "Assigned", options: users.map((u) => ({ value: u.id, label: u.name })) }] : []),
    { key: "created", label: "Created", options: CREATED },
  ];

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      {/* The headline count is every active customer you may see; the footer counts the current search and filters. */}
      <PageHeader title="Customers Management" subtitle={customers.data ? `${customers.data.activeCount} Active Customer Accounts` : !customers.error && <SubtitleSkeleton />} />

      <section className="flex min-w-0 flex-col rounded-[16px] border border-stroke2 bg-primary px-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2 py-4">
          <h2 className="text-[18px] font-semibold tracking-[-0.36px] text-black">Customers</h2>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <SearchBox
              value={query}
              onChange={setQuery}
            />
            {/* Report: every customer matching the search and filters (all pages), as CSV */}
            <ToolButton label="Report" icon="download" busy={report.busy} onClick={() => report.run({ q, ...rest, createdFrom: daysAgo(created) })} />
            <ToolButton label="Filter" icon="filter" btnRef={filterBtn} count={activeFilters(filter)} onClick={() => setFiltering(true)} />
            <Popover anchor={filterBtn} open={filtering} onClose={closeFilter} dx={-38.2} dy={46}>
              <FilterMenu
                groups={groups}
                value={filter}
                onPick={(key, value) => {
                  setFilter((f) => ({ ...f, [key]: value }));
                  setPage(1);
                  closeFilter();
                }}
              />
            </Popover>
          </div>
        </div>

        <div className="table-scroll">
          <div className="flex min-w-[1608px] flex-col">
            <div className="flex items-start border-b border-stroke2 py-3 text-[13px] font-medium text-nav/80">
              {COLS.map(([label, w], i) => (
                <p key={label} className={`shrink-0 whitespace-pre-line ${i < 2 ? `sticky z-[1] bg-primary ${i ? "left-[96px]" : "left-0"}` : ""}`} style={i ? col(w) : { width: w }}>
                  {label}
                </p>
              ))}
              <p className="text-center" style={col(128)}>Actions</p>
            </div>

            {!customers.data && !customers.error && <SkeletonRows columns={[...COLS.map(([, w]) => w), 128]} grow />}
            {!customers.data && customers.error && <LoadFailed what="customers" onRetry={customers.reload} />}
            {customers.data?.items.length === 0 && (
              <EmptyState>{filtered ? "No customers match your search or filters." : "No customers yet. Convert a lead to add its customer here."}</EmptyState>
            )}
            {customers.data?.items.map((c) => (
              <div key={c.id} className="flex items-start border-b border-stroke2 py-2.5">
                <p className={`${cell} sticky left-0 z-[1] w-[96px] self-stretch bg-primary font-semibold text-selected`}>{c.code}</p>
                <p className={`${cell} sticky left-[96px] z-[1] self-stretch bg-primary pr-3`} style={col(160)}>
                  <Link href={`/customers/${c.id}`} className="hover:text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                    {c.name}
                  </Link>
                </p>
                <p className={`${cell} pr-3`} style={col(140)}>{dash(c.company)}</p>
                <p className={cell} style={col(128)}>{dash(c.phone && formatPhone(c.phone))}</p>
                <p className={`${cell} truncate pr-3`} style={col(180)} title={c.email ?? undefined}>{dash(c.email)}</p>
                <p className={`${cell} pr-3`} style={col(160)}>{dash(c.address)}</p>
                <p className={cell} style={col(88)}>{dash(typeLabel(c.type))}</p>
                <p className={`${cell} pr-3`} style={col(104)}>{dash(c.source?.name)}</p>
                <p className={`${cell} pr-3`} style={col(128)}>{dash(c.assignee?.name)}</p>
                <div style={col(88)}>
                  <Badge label={cap(c.status)} width={70} />
                </div>
                <p className={cell} style={col(88)}>{day(c.createdAt)}</p>
                <p className={`${cell} pr-3`} style={col(120)}>{dash(c.note)}</p>
                <div className="flex items-center justify-center gap-1" style={col(128)}>
                  <IconButton icon="edit" label={`Edit ${c.name}`} onClick={() => setEditing(c)} />
                  {/* Customers are deactivated, never deleted (Sprint 3). */}
                  <button suppressHydrationWarning type="button" onClick={() => status.toggle(c)} disabled={status.busy === c.id} className={pill} aria-label={`${c.status === "active" ? "Deactivate" : "Activate"} ${c.name}`}>
                    {status.busy === c.id && <Spinner />}
                    {c.status === "active" ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Pagination {...paging(customers.data, "Customers", setPage)} />
      </section>

      <CustomerEditModal
        customer={editing}
        onClose={() => setEditing(null)}
        onSaved={(saved) => {
          setEditing(null);
          replace(saved);
        }}
      />
    </div>
  );
}
