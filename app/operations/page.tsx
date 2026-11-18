"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { useReport } from "@/components/feedback";
import { ShipmentModal } from "@/components/operations/ShipmentModal";
import { SkeletonRows, SubtitleSkeleton } from "@/components/skeletons";
import { activeFilters, col, DateField, EmptyState, FilterMenu, IconButton, LoadFailed, PageHeader, Pagination, Popover, SearchBox, ToolButton, type FilterGroup } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { paging, useApi, useDebounced, type List } from "@/lib/api";
import { shownValue, type Fields, type FieldType, type Shipment } from "@/lib/operations";

// The list-like columns the API filters by; each offers the values the shipments hold (GET /operations/shipments/options).
const FILTERS = ["status", "destination", "serviceType", "shipmentStatus", "pickupStatus", "documentationStatus", "invoice", "payment", "assignedOperator"];
type Options = Record<string, string[]> & { extraColumns: string[] };
const WIDTH: Record<FieldType, number> = { id: 130, date: 104, weight: 88, text: 150, category: 120, place: 120, customer: 170, user: 140, phone: 130 };
const cell = "shrink-0 pr-3 text-[14px] font-medium break-words text-black";

export default function OperationsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const importId = params.get("importId") ?? undefined;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Record<string, string>>({});
  const [booking, setBooking] = useState({ from: "", to: "" });
  const [page, setPage] = useState(1);
  const q = useDebounced(query);
  const [searched, setSearched] = useState(q);
  if (searched !== q) {
    setSearched(q);
    setPage(1);
  }
  const listQuery = { q, ...filter, bookingFrom: booking.from || undefined, bookingTo: booking.to || undefined, importId };
  const shipments = useApi<List<Shipment>>("/operations/shipments", { ...listQuery, page });
  const fields = useApi<Fields>("/operations/fields", undefined, 0, { keep: true });
  const [optionsTick, setOptionsTick] = useState(0);
  const options = useApi<Options>("/operations/shipments/options", undefined, optionsTick);
  const report = useReport("/operations/shipments/export", "Shipments export");
  const [open, setOpen] = useState<string | null>(null);

  const filterBtn = useRef<HTMLButtonElement>(null);
  const dateBtn = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<"filter" | "date" | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const cols = fields.data?.fields ?? [];
  const headerOf = (key: string) => cols.find((f) => f.key === key)?.header ?? key;
  const groups: FilterGroup[] = FILTERS.filter((k) => options.data?.[k]?.length).map((k) => ({ key: k, label: headerOf(k), options: options.data![k]!.map((v) => ({ value: v, label: v })) }));
  const filtered = !!query || activeFilters(filter) > 0 || !!booking.from || !!booking.to || !!importId;
  const minWidth = cols.reduce((n, f) => n + WIDTH[f.type], 0) + 64;

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <PageHeader
        title="All Operations"
        subtitle={shipments.data ? `${shipments.data.total.toLocaleString("en-IN")} ${filtered ? "matching " : ""}shipments` : !shipments.error && <SubtitleSkeleton />}
        action={
          <Link
            href="/operations/import"
            className="flex h-10 shrink-0 items-center gap-2 rounded-[12px] bg-button px-4 text-[14px] font-medium whitespace-nowrap text-white transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <Icon name="upload" size={20} className="text-white" />
            Upload Excel
          </Link>
        }
      />

      <section className="flex min-w-0 flex-col rounded-[16px] border border-stroke2 bg-primary px-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2 py-4">
          <h2 className="text-[18px] font-semibold tracking-[-0.36px] text-black">Shipments</h2>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <SearchBox value={query} onChange={setQuery} />
            <ToolButton label="Export" icon="download" busy={report.busy} onClick={() => report.run(listQuery)} />
            <ToolButton label="Booking date" icon="calendar" btnRef={dateBtn} count={(booking.from ? 1 : 0) + (booking.to ? 1 : 0)} onClick={() => setMenu((m) => (m === "date" ? null : "date"))} />
            <Popover anchor={dateBtn} open={menu === "date"} onClose={closeMenu} align="end">
              <div className="flex w-[260px] flex-col gap-3 p-3.5">
                {(["from", "to"] as const).map((k) => (
                  <div key={k} className="flex flex-col gap-1.5">
                    <span className="text-[13px] font-medium text-nav">{k === "from" ? "From" : "To"}</span>
                    <DateField
                      value={booking[k]}
                      min={k === "to" ? booking.from || undefined : undefined}
                      max={k === "from" ? booking.to || undefined : undefined}
                      onChange={(v) => {
                        setBooking((b) => ({ ...b, [k]: v }));
                        setPage(1);
                      }}
                    />
                  </div>
                ))}
                {(booking.from || booking.to) && (
                  <button suppressHydrationWarning type="button" onClick={() => (setBooking({ from: "", to: "" }), setPage(1))} className="cursor-pointer self-start text-[14px] font-semibold text-link">
                    Clear dates
                  </button>
                )}
              </div>
            </Popover>
            <ToolButton
              label="Filter"
              icon="filter"
              btnRef={filterBtn}
              count={activeFilters(filter)}
              onClick={() => {
                if (menu !== "filter") setOptionsTick((t) => t + 1); // values added since the page opened
                setMenu((m) => (m === "filter" ? null : "filter"));
              }}
            />
            <Popover anchor={filterBtn} open={menu === "filter"} onClose={closeMenu} align="end">
              {groups.length ? (
                <FilterMenu
                  groups={groups}
                  value={filter}
                  onPick={(key, value) => {
                    setFilter((f) => ({ ...f, [key]: value }));
                    setPage(1);
                  }}
                />
              ) : (
                <p className="w-[220px] px-3.5 py-3 text-[14px] text-nav">{options.data ? "Nothing to filter by yet." : "Loading…"}</p>
              )}
            </Popover>
          </div>
        </div>

        {importId && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[12px] bg-bg5 px-3.5 py-2 text-[14px] text-black">
            Showing the shipments from one import.
            <button suppressHydrationWarning type="button" onClick={() => router.replace("/operations")} className="cursor-pointer font-semibold text-link">
              Show all shipments
            </button>
          </div>
        )}

        <div className="table-scroll">
          <div className="flex flex-col" style={{ minWidth }}>
            <div className="flex items-start border-b border-stroke2 py-3 text-[13px] font-medium text-nav/80">
              {cols.map((f, i) => (
                <p key={f.key} className={`shrink-0 pr-3 ${i === 0 ? "sticky left-0 z-[1] bg-primary" : ""}`} style={col(WIDTH[f.type])}>
                  {f.header}
                </p>
              ))}
              <p className="shrink-0 text-center" style={col(64)}>
                View
              </p>
            </div>

            {(!shipments.data || !fields.data) && !shipments.error && !fields.error && <SkeletonRows columns={cols.length ? [...cols.map((f) => WIDTH[f.type]), 64] : [130, 120, 104, 130, 130, 150]} grow />}
            {(shipments.error || fields.error) && !shipments.data && <LoadFailed what="shipments" onRetry={() => (shipments.reload(), fields.reload())} />}
            {shipments.data?.items.length === 0 && (
              <EmptyState>{filtered ? "No shipments match your search or filters." : "No shipments yet. Use Upload Excel to import the shipment workbook."}</EmptyState>
            )}
            {fields.data &&
              shipments.data?.items.map((s) => (
                <div key={s.id} className="flex items-start border-b border-stroke2 py-2.5">
                  {cols.map((f, i) => (
                    <p key={f.key} className={`${cell} ${i === 0 ? "sticky left-0 z-[1] self-stretch bg-primary font-semibold text-selected" : ""}`} style={col(WIDTH[f.type])}>
                      {shownValue(f, s[f.key]) || "------"}
                    </p>
                  ))}
                  <div className="flex shrink-0 justify-center" style={col(64)}>
                    <IconButton icon="eye" label={`View shipment ${s.awbNumber ?? s.awbNo ?? ""}`} onClick={() => setOpen(s.id)} />
                  </div>
                </div>
              ))}
          </div>
        </div>

        {shipments.data && <Pagination {...paging(shipments.data, "Shipments", setPage)} />}
      </section>

      <ShipmentModal
        id={open}
        fields={cols}
        options={options.data ?? {}}
        onClose={() => setOpen(null)}
        onSaved={(saved) => shipments.mutate((list) => ({ ...list, items: list.items.map((x) => (x.id === saved.id ? saved : x)) }))}
      />
    </div>
  );
}
