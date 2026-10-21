"use client";

import { Icon, type IconName } from "@/components/Icon";
import { Loading, Skeleton } from "@/components/skeletons";
import { LoadFailed } from "@/components/ui";
import { useApi } from "@/lib/api";

type Summary = {
  kpis: {
    totalLeads: number;
    newLeads: number;
    activeLeads: number;
    convertedLeads: number;
    lostLeads: number;
    activeCustomers: number;
    followUpsDueToday: number;
    followUpsOverdue: number;
    openLeadValue: number;
    convertedValue: number;
    conversionRate: number;
  };
  byStatus: { status: { id: string; name: string }; count: number }[];
  bySource: { source: { id: string; name: string } | null; count: number; share: number }[];
};

const AXIS = 108; // y-axis offset from the label column (wide enough for whole stage names)
// Bar rows: ROW apart, BAR tall, the first FIRST below the top; the x-axis sits just under the last bar.
const ROW = 44;
const BAR = 28;
const FIRST = 12;
const along = (frac: number) => `calc(${AXIS}px + (100% - ${AXIS}px) * ${frac})`;
const count = (n = 0) => String(n).padStart(2, "0"); // the design shows "02", "09"…
// ₹27.3L / ₹4.2Cr / ₹47K, as in the design
const compact = (n = 0) => (n >= 1e7 ? `₹${+(n / 1e7).toFixed(1)}Cr` : n >= 1e5 ? `₹${+(n / 1e5).toFixed(1)}L` : n >= 1e3 ? `₹${+(n / 1e3).toFixed(1)}K` : `₹${n}`);
// Legend colours from the design (public/img/legend-1…5.svg), repeated for extra sources.
const PALETTE = ["#8ca0fa", "#7c5cfc", "#10b981", "#f59e0b", "#6b7280"];

/** `value` null = still loading: a placeholder, never a "00" that looks like a real figure. */
function StatCard({ label, value, caption, icon }: { label: string; value: string | null; caption: string; icon: IconName }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[16px] border border-stroke2 bg-primary px-4 py-3.5">
      <div className="flex min-w-0 flex-col gap-1 whitespace-nowrap">
        <p className="text-[13px] font-medium text-nav opacity-80">{label}</p>
        {value === null ? <Skeleton className="my-0.5 h-6 w-16" /> : <p className="text-[24px] leading-7 font-bold text-black">{value}</p>}
        <p className="text-[12px] text-nav opacity-70">{caption}</p>
      </div>
      <Icon name={icon} size={26} className="shrink-0 text-nav" />
    </div>
  );
}

// 1, 2, 5 × 10ⁿ step so the five axis ticks read cleanly.
function niceStep(max: number) {
  const raw = Math.max(1, max) / 5;
  const pow = 10 ** Math.floor(Math.log10(raw));
  return ([1, 2, 5, 10].find((m) => m * pow >= raw) ?? 10) * pow;
}

// Loading: six bar outlines in the chart's own rows, spaced like the bars.
const TREND_PLACEHOLDER = [70, 45, 85, 30, 55, 20];

function LeadsTrend({ rows }: { rows: Summary["byStatus"] | null }) {
  const step = niceStep(Math.max(0, ...(rows ?? []).map((r) => r.count)));
  const scale = step * 5;
  const axisY = FIRST + BAR + 4 + ROW * Math.max(0, (rows ?? TREND_PLACEHOLDER).length - 1);
  return (
    <div className="flex w-full min-w-0 flex-col gap-4 rounded-[16px] border border-stroke2 bg-primary p-4 xl:flex-1">
      <p className="text-[16px] font-semibold tracking-[-0.32px] text-black">Leads Trend</p>
      {!rows ? (
        <Loading className="relative" label="Loading the leads trend…">
          <div style={{ height: axisY + 20.66 }}>
            {TREND_PLACEHOLDER.map((w, i) => (
              <div key={i} className="absolute flex w-full items-center gap-[14px]" style={{ top: FIRST + ROW * i }}>
                <Skeleton className="h-3.5 w-[92px]" />
                <Skeleton className="h-7 rounded-l-none rounded-r-[10px]" style={{ width: `calc((100% - ${AXIS}px) * ${w / 100})` }} />
              </div>
            ))}
          </div>
        </Loading>
      ) : (
      <div className="max-md:overflow-x-auto">
        <div className="relative max-md:min-w-[520px]" style={{ height: axisY + 20.66 }}>
          <div className="absolute top-0 left-[108px] w-px bg-black/50" style={{ height: axisY + 14.13 }} />
          <div className="absolute right-0 left-[108px] h-px bg-black/50" style={{ top: axisY }} />
          {rows.map((row, i) => (
            <div key={row.status.id}>
              <div className="absolute left-0 flex h-7 items-center gap-3" style={{ top: FIRST + ROW * i }}>
                <p className="w-[92px] truncate text-right text-[13px] font-medium opacity-80" title={row.status.name}>
                  {row.status.name}
                </p>
                <div className="h-[0.5px] w-[3.32px] bg-black" />
              </div>
              {/* Hover → overlay (Dissolve 300ms ease-out) above the bar's end, inside the chart (beyond it, it widened the page) */}
              <div
                className="group absolute left-[108px] h-7 rounded-r-[10px] bg-linear-to-b from-[#6195f0] to-[#8cb6ff]"
                style={{ top: FIRST + ROW * i, width: `calc((100% - ${AXIS}px) * ${row.count / scale})` }}
              >
                {/* The count at the bar's end: readable without hovering (touch screens can't hover). */}
                <span className="absolute top-1/2 left-full ml-2 -translate-y-1/2 text-[12px] font-semibold text-nav">{row.count}</span>
                <div className="pointer-events-none absolute right-0 bottom-full z-10 mb-1.5 flex w-[106px] flex-col items-center gap-2 rounded-[12px] border border-stroke2 bg-[linear-gradient(135.15deg,#f8fcfd_8.81%,#c2edf8_91.19%)] dark:bg-[linear-gradient(135deg,#17222e_8%,#123847_92%)] p-2.5 text-[13px] font-medium text-nav opacity-0 transition-opacity group-hover:opacity-100">
                  <p className="text-center opacity-70">{row.status.name}</p>
                  <p className="w-[80px] text-right opacity-70">Leads - {row.count}</p>
                </div>
              </div>
            </div>
          ))}
          {[1, 2, 3, 4, 5].map((t) => (
            <div key={t} className="absolute flex w-10 -translate-x-1/2 flex-col items-center gap-[2px]" style={{ top: axisY, left: along(t / 5) }}>
              <div className="h-[3.32px] w-[0.5px] bg-black" />
              <p className="text-center text-[11px] font-medium opacity-70">{step * t}</p>
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  );
}

// Donut: ring of radius 80 / width 40 in a 200px viewBox (drawn at 168px), like the Figma graphic, from the data.
function LeadSources({ rows: data }: { rows: Summary["bySource"] | null }) {
  const rows = data ?? [];
  const C = 2 * Math.PI * 80;
  const total = rows.reduce((n, r) => n + r.count, 0);
  const lens = rows.map((r) => (total ? (r.count / total) * C : 0));
  const starts = lens.map((_, i) => lens.slice(0, i).reduce((a, b) => a + b, 0));
  return (
    <div className="flex w-full shrink-0 flex-col gap-4 rounded-[16px] border border-stroke2 bg-primary p-4 xl:w-[320px]">
      <p className="text-[16px] font-semibold tracking-[-0.32px] text-black">Leads Sources</p>
      <div className="flex w-full flex-col items-center gap-4">
        {/* Loading: the empty ring (shimmering) and legend rows stand in for the chart. */}
        <svg width={168} height={168} viewBox="0 0 200 200" role="img" aria-label={data ? "Lead sources chart" : "Loading the lead sources chart"} className={`-rotate-90 ${data ? "" : "motion-safe:animate-pulse"}`}>
          <circle cx={100} cy={100} r={80} fill="none" strokeWidth={40} className="stroke-[#e5e7eb] dark:stroke-[#243241]" />
          {rows.map((r, i) => (
            <circle key={r.source?.id ?? "none"} cx={100} cy={100} r={80} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth={40} strokeDasharray={`${lens[i]} ${C - lens[i]!}`} strokeDashoffset={-starts[i]!} />
          ))}
        </svg>
        {!data && (
          <Loading className="flex w-full flex-col gap-3" label="Loading the lead sources…">
            {[60, 45, 70].map((w, i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-4" style={{ width: `${w}%` }} />
                <Skeleton className="h-4 w-9" />
              </div>
            ))}
          </Loading>
        )}
        <ul className="flex w-full flex-col gap-3">
          {rows.map((s, i) => (
            <li key={s.source?.id ?? "none"} className="flex items-center justify-between text-[13px] text-black">
              <span className="flex items-center gap-2">
                <span className="size-2.5 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                {s.source?.name ?? "No source"}
              </span>
              <span className="font-medium">{s.share}%</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const summary = useApi<Summary>("/dashboard/summary");
  const data = summary.data;
  const k = data?.kpis;
  // Until the first answer every figure is a placeholder (null); after a failed first load, the "no value" mark.
  const fig = (f: (k: Summary["kpis"]) => string) => (k ? f(k) : summary.error ? "------" : null);
  const rows: { label: string; value: string | null; caption: string; icon: IconName }[][] = [
    [
      { label: "Total Leads", value: fig((k) => count(k.totalLeads)), caption: "All time", icon: "chart" },
      { label: "New Leads", value: fig((k) => count(k.newLeads)), caption: "Awaiting Contact", icon: "won" },
      { label: "Active Leads", value: fig((k) => count(k.activeLeads)), caption: "In Kanban", icon: "active" },
      { label: "Converted", value: fig((k) => count(k.convertedLeads)), caption: "Leads Won", icon: "converted" },
    ],
    [
      { label: "Lost Leads", value: fig((k) => count(k.lostLeads)), caption: "Leads Lost", icon: "loss" },
      { label: "Customer", value: fig((k) => count(k.activeCustomers)), caption: "Active Accounts", icon: "profile-2user" },
      { label: "Pending Follow Ups", value: fig((k) => count(k.followUpsDueToday)), caption: "Due Today", icon: "calendar-pending" },
      { label: "Overdue Follow Ups", value: fig((k) => count(k.followUpsOverdue)), caption: "Action Required", icon: "calendar-remove" },
    ],
    [
      { label: "Total Lead Value", value: fig((k) => compact(k.openLeadValue)), caption: "Expected Kanban", icon: "dollar-circle" },
      { label: "Converted Value", value: fig((k) => compact(k.convertedValue)), caption: "Revenue Secured", icon: "converted-value" },
      { label: "Conversion Rate", value: fig((k) => `${k.conversionRate}%`), caption: "Leads - Customers", icon: "global" },
    ],
  ];
  const [row1, row2, row3] = rows;
  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      {!data && summary.error && <LoadFailed what="dashboard figures" onRetry={summary.reload} />}
      {[row1!, row2!].map((row, i) => (
        <div key={i} className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {row.map((s) => <StatCard key={s.label} {...s} />)}
        </div>
      ))}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {row3!.map((s) => <StatCard key={s.label} {...s} />)}
      </div>
      <div className="flex flex-col items-start gap-4 xl:flex-row">
        <LeadsTrend rows={data?.byStatus ?? (summary.error ? [] : null)} />
        <LeadSources rows={data?.bySource ?? (summary.error ? [] : null)} />
      </div>
    </div>
  );
}
