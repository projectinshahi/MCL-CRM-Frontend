"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRemove } from "@/components/feedback";
import { Icon } from "@/components/Icon";
import { card, h2, primary, RatesFrame } from "@/components/rates/RatesFrame";
import { SkeletonRows } from "@/components/skeletons";
import { Badge, col, EmptyState, IconButton, LoadFailed } from "@/components/ui";
import { day, useApi } from "@/lib/api";
import { CONTENTS, label, SCOPES, type RateCard } from "@/lib/rates";

// Settings → Courier Rate Management: every rate card, with the Upload Courier Rate Excel button; each card can be
// opened, edited (details, courier, account, dates, charges) or deleted.
const COLS = [["Courier / account", 160], ["Rate card", 220], ["Rates for", 170], ["Origin", 100], ["In force", 170], ["Prices", 90], ["Status", 100], ["Actions", 96]] as const;

export default function RateCardsPage() {
  const cards = useApi<RateCard[]>("/rate-cards");
  const router = useRouter();
  const { remove, removing } = useRemove(cards.reload);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const state = (c: RateCard) => (!c.active ? ["Inactive", "slate"] : c.effectiveFrom > today ? ["Starts later", "amber"] : c.effectiveTo && c.effectiveTo < today ? ["Expired", "red"] : ["In force", "green"]) as [string, "slate" | "amber" | "red" | "green"];
  const del = (c: RateCard) =>
    remove(c.id, {
      path: `/rate-cards/${c.id}`,
      title: "Delete rate card?",
      message: (
        <>
          <b className="text-black">{c.name}</b> ({c.courier.name}, {c.account?.name ?? "general rates"}) and its {c.prices} prices{c.destinations ? ` and ${c.destinations} destinations` : ""} will be deleted. The calculator stops using it at once.
        </>
      ),
      confirmLabel: "Delete",
      success: "Rate card deleted",
      successDetail: c.name,
      failTitle: "Couldn't delete the rate card",
    });
  return (
    <RatesFrame
      sub={0}
      action={
        <Link href="/settings/courier-rates/upload" className={primary}>
          <Icon name="upload" size={20} className="text-white" />
          Upload Courier Rate Excel
        </Link>
      }
    >
      <section className={card}>
        <div className="flex flex-col gap-0.5">
          <h2 className={h2}>Rate cards</h2>
          <p className="text-[14px] text-nav">The DTDC Calculator prices shipments from the cards in force. Edit a card for its name, courier, account, dates and charges; a new rate list is uploaded as a new card.</p>
        </div>
        <div className="table-scroll">
          <div className="flex min-w-[1106px] flex-col">
            <div className="flex border-b border-stroke2 py-2.5 text-[13px] font-medium text-nav/80">
              {COLS.map(([l, w]) => (
                <p key={l} className={`shrink-0 pr-3 ${l === "Actions" ? "text-center" : ""}`} style={col(w)}>{l}</p>
              ))}
            </div>
            {!cards.data && !cards.error && <SkeletonRows columns={COLS.map(([, w]) => w)} rows={4} grow />}
            {!cards.data && cards.error && <LoadFailed what="rate cards" onRetry={cards.reload} />}
            {cards.data?.length === 0 && <EmptyState>No rate cards yet. Add the courier under Couriers &amp; Accounts, then upload its rate Excel.</EmptyState>}
            {cards.data?.map((c) => {
              const [s, tone] = state(c);
              return (
                <div key={c.id} className="flex items-start border-b border-stroke2 py-2.5 text-[14px] font-medium text-black">
                  <p className="shrink-0 pr-3 break-words" style={col(160)}>
                    <span className="block font-semibold text-selected">{c.courier.name}</span>
                    <span className="text-[13px] text-nav">{c.account?.name ?? "General rates"}</span>
                  </p>
                  <p className="shrink-0 pr-3 break-words" style={col(220)}>
                    <Link href={`/settings/courier-rates/${c.id}`} className="hover:text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                      {c.name}
                    </Link>
                    {c.import && <span className="block text-[12px] font-normal text-nav break-all">{c.import.fileName}</span>}
                  </p>
                  <p className="shrink-0 pr-3 text-[13px]" style={col(170)}>
                    {label(SCOPES, c.scope)}
                    {c.service && ` · ${c.service}`}
                    <span className="block text-nav">{label(CONTENTS, c.contents)}</span>
                  </p>
                  <p className="shrink-0 pr-3" style={col(100)}>{c.origin || "------"}</p>
                  <p className="shrink-0 pr-3 text-[13px]" style={col(170)}>
                    {day(c.effectiveFrom)} – {c.effectiveTo ? day(c.effectiveTo) : "no expiry"}
                  </p>
                  <p className="shrink-0 pr-3" style={col(90)}>
                    {c.prices}
                    {c.destinations > 0 && <span className="block text-[12px] font-normal text-nav">{c.destinations} destinations</span>}
                  </p>
                  <div className="shrink-0" style={col(100)}>
                    <Badge label={s} tone={tone} />
                  </div>
                  <div className="flex shrink-0 justify-center gap-1" style={col(96)}>
                    <IconButton icon="edit" label={`Edit ${c.name}`} onClick={() => router.push(`/settings/courier-rates/${c.id}`)} />
                    <IconButton icon="delete" label={`Delete ${c.name}`} onClick={() => del(c)} disabled={removing === c.id} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </RatesFrame>
  );
}
