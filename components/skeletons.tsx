import type { CSSProperties, ReactNode } from "react";

// Skeletons stand in for content that is genuinely loading, in its own shape and size, so nothing jumps when the data
// arrives. They are shown only until the first answer: a background refresh keeps the current content on screen
// (lib/api useApi keeps the previous data), and a failed load shows its error, never a skeleton.
// Screen readers hear "Loading…" once (role=status) instead of the decorative blocks.

/** One placeholder block: size and round it like the content it stands for. Shimmer style: globals.css .skeleton */
export function Skeleton({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <span aria-hidden className={`skeleton block rounded-[8px] ${className}`} style={style} />;
}

/** A page header's count line ("12 Total Leads") until its number is known, instead of a misleading 0. */
export const SubtitleSkeleton = () => <Skeleton className="my-px h-4 w-40" />;

/** A loading region: announced once, its placeholder blocks hidden from assistive technology. */
export function Loading({ children, className, label = "Loading…" }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <div role="status" aria-busy className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

// Varied but stable bar lengths, so rows don't look like a barcode and don't change between renders.
const fill = (row: number, col: number) => `${55 + ((row * 7 + col * 13) % 40)}%`;

/**
 * Table rows under a table's (kept) header: one bar per column, rows spaced like the data rows. Columns are pixel
 * widths ("flex" = takes the rest); `grow` sizes them as shares of the row instead, for tables laid out that way.
 */
export function SkeletonRows({ columns, rows = 6, twoLine = false, grow = false }: { columns: (number | "flex")[]; rows?: number; twoLine?: boolean; grow?: boolean }) {
  const size = (w: number | "flex"): CSSProperties | undefined => (w === "flex" ? undefined : grow ? { flex: `${w} 0 0`, minWidth: w } : { width: w });
  return (
    <Loading>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center border-b border-stroke2 py-3">
          {columns.map((w, c) => (
            <div key={c} className={`flex flex-col gap-1.5 pr-4 ${w === "flex" ? "min-w-0 flex-1" : "shrink-0"}`} style={size(w)}>
              <Skeleton className="h-4" style={{ width: fill(r, c) }} />
              {twoLine && c === 0 && <Skeleton className="h-3 w-1/2" />}
            </div>
          ))}
        </div>
      ))}
    </Loading>
  );
}

/** A list of entries (activity, history): a line of text and a smaller line under it. */
export function SkeletonLines({ rows = 4, className = "flex flex-col gap-4" }: { rows?: number; className?: string }) {
  return (
    <Loading className={className}>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex flex-col gap-1.5">
          <Skeleton className="h-4" style={{ width: fill(r, 1) }} />
          <Skeleton className="h-3 w-36" />
        </div>
      ))}
    </Loading>
  );
}

/** A labelled value (Info on the detail pages): label line above a value line. */
function InfoBlock({ wide = false }: { wide?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Skeleton className="h-3 w-20" />
      <Skeleton className={`h-5 ${wide ? "w-3/4" : "w-28"}`} />
    </div>
  );
}

const card = "flex min-w-0 flex-col gap-5 rounded-[16px] border border-stroke2 bg-primary p-5";
const heading = <Skeleton className="h-6 w-44" />;

/** The lead / customer detail layout: main card and activity on the left, contact cards on the right. */
export function DetailSkeleton() {
  return (
    <Loading className="flex flex-col gap-4 xl:flex-row xl:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <section className={card}>
          <div className="flex items-center justify-between gap-3 border-b border-stroke2 pb-4">
            <Skeleton className="h-7 w-2/3 max-w-[420px]" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => <InfoBlock key={i} />)}
          </div>
          <InfoBlock wide />
        </section>
        <section className={card}>
          <div className="border-b border-stroke2 pb-4">{heading}</div>
          <SkeletonLines rows={3} />
        </section>
      </div>
      <div className="flex min-w-0 flex-col gap-4 xl:w-[340px] xl:shrink-0">
        <section className={card}>
          <div className="border-b border-stroke2 pb-4">{heading}</div>
          <div className="flex flex-col gap-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-5 shrink-0 rounded-full" />
                <InfoBlock />
              </div>
            ))}
          </div>
        </section>
      </div>
    </Loading>
  );
}

/**
 * A pipeline stage column (app/leads/(list)/pipeline): 240px at least, sharing any spare width up to 320px, so the
 * stages fill the board on wide screens without the cards growing oversized.
 */
export const LANE = "flex flex-[1_0_240px] max-w-[320px] flex-col gap-2 rounded-[14px] border border-stroke2 p-2";

/** Pipeline: the board's stage columns (sized as on the board) with a few card outlines each. */
export function PipelineSkeleton({ columns = 5 }: { columns?: number }) {
  return (
    <Loading className="flex items-stretch gap-2.5">
      {Array.from({ length: columns }, (_, c) => (
        <section key={c} className={`${LANE} bg-bg5`}>
          <header className="flex flex-col gap-1.5 border-b border-stroke2 px-1 pb-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="size-5 rounded-full" />
            </div>
            <Skeleton className="h-3 w-16" />
          </header>
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 - (c % 2) }, (_, i) => (
              <div key={i} className="flex flex-col gap-2.5 rounded-[12px] border border-stroke2 bg-primary p-3">
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-4" style={{ width: fill(i, c) }} />
                  <Skeleton className="size-7 shrink-0 rounded-[8px]" />
                </div>
                <Skeleton className="h-5 w-[60px] rounded-full" />
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3 w-36" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </Loading>
  );
}

/** Stacked cards (notifications, follow-up history, settings rows): `className` gives each card its own frame. */
export function SkeletonCards({ rows = 3, className, children }: { rows?: number; className: string; children: ReactNode }) {
  return (
    <Loading className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={className}>
          {children}
        </div>
      ))}
    </Loading>
  );
}
