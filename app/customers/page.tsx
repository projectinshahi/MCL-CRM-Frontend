"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { useToast } from "@/components/feedback";
import { useMe } from "@/components/Shell";
import { SkeletonRows, SubtitleSkeleton } from "@/components/skeletons";
import { Badge, EmptyState, FilterMenu, IconButton, LoadFailed, PageHeader, Pagination, Popover, SearchBox, Spinner, ToolButton, type FilterGroup } from "@/components/ui";
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

// Figma 1:6831 header row (+ Customer ID, Sprint 3): [label, width]. Total 1906 = table min-width.
const COLS = [
  ["Customer ID", 120], ["Customer Name", 220], ["Company", 160], ["Phone                                                                                                                                                                                                                                                                                        Number", 140], ["EMail", 160], ["Address", 220],
  ["Customer\nType", 120], ["Source", 120], ["Assigned User", 120], ["Status", 100], ["Created\nDate", 100], ["Note", 180],
] as const;

const cell = "shrink-0 text-[16px] font-medium break-words text-black";
const dash = (v: string | null | undefined) => v || "------";
const pill =
  "flex h-[38px] w-[96px] cursor-pointer items-center justify-center gap-1 rounded-[12px] border border-stroke2 bg-bg5 text-[14px] font-medium text-nav transition-colors hover:bg-[rgb(71_215_251/0.2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-wait disabled:opacity-60";

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

  const toast = useToast();
  const notYet = (what: string) => toast.info(`${what} isn't available yet`, "This will be added once its scope is agreed.");
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
    <div className="flex flex-col gap-[18px] p-4 sm:p-6">
      {/* The headline count is every active customer you may see; the footer counts the current search and filters. */}
      <PageHeader title="Customers Management" subtitle={customers.data ? `${customers.data.activeCount} Active Customer Accounts` : !customers.error && <SubtitleSkeleton />} />

      {/* Figma lays children out at x=21 (stroke included in layout) → px-20 + 1px border */}
      <section className="flex min-w-0 flex-col gap-[10px] rounded-[22px] border border-stroke2 bg-primary px-5">
        <div className="flex flex-wrap items-center justify-between gap-2 pt-6 pb-5">
          <h2 className="text-[28px] font-medium text-black">Customers</h2>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <SearchBox
              value={query}
              onChange={setQuery}
            />
            {/* Report: export scope not decided yet (report O1) */}
            <ToolButton label="Report" icon="download" onClick={() => notYet("Customer export")} />
            <ToolButton label="Filter" icon="filter" btnRef={filterBtn} onClick={() => setFiltering(true)} />
            <Popover anchor={filterBtn} open={filtering} onClose={closeFilter} dx={-38.2} dy={54}>
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

        <div className="overflow-x-auto">
          <div className="flex min-w-[1906px] flex-col gap-[10px]">
            <div className="flex items-start border-b border-stroke2 py-5 text-[16px] font-medium tracking-[-0.64px] text-nav">
              {COLS.map(([label, w]) => (
                <p key={label} className="shrink-0 whitespace-pre-line opacity-80" style={{ width: w }}>
                  {label}
                </p>
              ))}
              <p className="w-[146px] shrink-0 text-center opacity-80">Actions</p>
            </div>

            {!customers.data && !customers.error && <SkeletonRows columns={[...COLS.map(([, w]) => w), 146]} />}
            {!customers.data && customers.error && <LoadFailed what="customers" onRetry={customers.reload} />}
            {customers.data?.items.length === 0 && (
              <EmptyState>{filtered ? "No customers match your search or filters." : "No customers yet. Convert a lead to add its customer here."}</EmptyState>
            )}
            {customers.data?.items.map((c) => (
              <div key={c.id} className="flex items-start border-b border-stroke2 pt-[10px] pb-4">
                <p className={`${cell} w-[120px] font-semibold tracking-[-0.32px] text-selected`}>{c.code}</p>
                <p className={`${cell} w-[220px] tracking-[-0.64px]`}>
                  <Link href={`/customers/${c.id}`} className="hover:text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                    {c.name}
                  </Link>
                </p>
                <p className={`${cell} w-[160px] tracking-[-0.64px]`}>{dash(c.company)}</p>
                <p className={`${cell} w-[140px] tracking-[-0.64px]`}>{dash(c.phone && formatPhone(c.phone))}</p>
                <p className={`${cell} w-[160px] truncate tracking-[-0.64px]`} title={c.email ?? undefined}>{dash(c.email)}</p>
                <p className={`${cell} w-[220px] tracking-[-0.64px]`}>{dash(c.address)}</p>
                <p className={`${cell} w-[120px]`}>{dash(typeLabel(c.type))}</p>
                <p className={`${cell} w-[120px] tracking-[-0.64px]`}>{dash(c.source?.name)}</p>
                <p className={`${cell} w-[120px] tracking-[-0.64px]`}>{dash(c.assignee?.name)}</p>
                <div className="w-[100px] shrink-0">
                  <Badge label={cap(c.status)} width={80} />
                </div>
                <p className={`${cell} w-[100px]`}>{day(c.createdAt)}</p>
                <p className={`${cell} w-[180px] tracking-[-0.64px]`}>{dash(c.note)}</p>
                <div className="flex w-[146px] shrink-0 items-center justify-center gap-1">
                  <IconButton icon="edit" label={`Edit ${c.name}`} onClick={() => setEditing(c)} className="h-[38px]!" />
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
