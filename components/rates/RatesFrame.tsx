"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { TABS } from "@/components/settings/SettingsList";
import { SectionHeader, UnderlineTabs } from "@/components/users/SectionHeader";

const SUB = [
  { label: "Rate Cards", href: "/settings/courier-rates" },
  { label: "Couriers & Accounts", href: "/settings/courier-rates/couriers" },
  { label: "Weight Rules", href: "/settings/courier-rates/weights" },
];

/** Settings → Courier Rate Management: the Settings tabs, then this section's own (rate cards, couriers, weight rules). */
export function RatesFrame({ sub, action, children }: { sub: number | null; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex w-full flex-col gap-4">
        <SectionHeader title="Settings" subtitle="Configure Your CRM Workspace" />
        <UnderlineTabs tabs={TABS} active={2} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="Courier Rate Management" className="flex flex-wrap gap-1.5">
          {SUB.map((t, i) => (
            <Link
              key={t.href}
              href={t.href}
              aria-current={i === sub ? "page" : undefined}
              className={`flex h-9 items-center rounded-[10px] px-3 text-[14px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                i === sub ? "bg-button text-white" : "border border-stroke2 bg-bg5 text-nav hover:bg-[rgb(71_215_251/0.2)]"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        {action}
      </div>
      {children}
    </div>
  );
}

export const card = "flex min-w-0 flex-col gap-4 rounded-[16px] border border-stroke2 bg-primary p-4 sm:p-5";
export const h2 = "text-[18px] font-semibold tracking-[-0.36px] text-black";
const btn = "flex h-10 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[12px] px-4 text-[14px] font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-wait disabled:opacity-70";
export const primary = `${btn} bg-button text-white hover:bg-secondary`;
export const secondary = `${btn} border border-button bg-white text-black hover:bg-bg5 dark:bg-transparent`;
export const checkbox = "size-4 cursor-pointer accent-button";
