"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { cap, day } from "@/lib/api";
import { TYPE_LABEL, type FollowUp } from "./NewFollowUpForm";

// Figma component set 1:8003: Variant2 (collapsed) ⇄ Default (expanded), ON_CLICK, Smart Animate 300ms ease-out.
export function HistoryItem({ name, count, entries }: { name: string; count: number; entries: FollowUp[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div onClick={() => setOpen((o) => !o)} className="w-full cursor-pointer rounded-[14px] border border-stroke2 bg-bg5 px-4 py-1">
      <button suppressHydrationWarning type="button" aria-expanded={open} className="flex w-full cursor-pointer items-center justify-between gap-4 py-2 text-left">
        <span className="flex items-center gap-3 text-[14px] font-medium text-black">
          <Icon name="arrow-right" size={16} className={`text-nav transition-transform ${open ? "-rotate-90" : ""}`} />
          {name}
        </span>
        <Badge label={`${count} Completed`} tone="green" />
      </button>

      <div className={`grid transition-[grid-template-rows] ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="table-scroll mt-[6px] border-t border-stroke2">
            <div className="min-w-[820px]" /* scrolls sideways on narrow screens */>
              <div className="flex items-center gap-4 border-b border-stroke2 py-2 text-[13px] font-medium text-nav/80">
                <p className="min-w-px flex-1">Note</p>
                <p className="w-[120px] shrink-0">Type</p>
                <p className="w-[140px] shrink-0">Assigned To</p>
                <p className="w-[108px] shrink-0">Status</p>
                <p className="w-[104px] shrink-0 text-center">Due Date</p>
                <p className="w-[104px] shrink-0 text-center">Completed</p>
              </div>
              {entries.map((e) => (
                <div key={e.id} className="flex items-center gap-4 py-2.5 text-[14px] font-medium text-black">
                  <div className="flex min-w-px flex-1 flex-col gap-0.5">
                    <p>{e.note}</p>
                    <p className="text-[13px] text-link">{e.lead.label}</p>
                  </div>
                  <p className="w-[120px] shrink-0">{TYPE_LABEL[e.type]}</p>
                  <p className="w-[140px] shrink-0">{e.assignee?.name ?? "------"}</p>
                  <div className="flex w-[108px] shrink-0">
                    <Badge label={cap(e.status)} width={84} />
                  </div>
                  <p className="w-[104px] shrink-0 text-center">{day(e.dueDate)}</p>
                  <p className="w-[104px] shrink-0 text-center">{day(e.completedAt)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
