"use client";

import Link from "next/link";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/feedback";
import { useMe } from "@/components/Shell";
import { SectionHeader } from "@/components/users/SectionHeader";
import { MODULES, modulesFor, type Module } from "@/lib/modules";

// Figma 1:6487. Cards = component set 1:8088: ON_HOVER → Variant2 (1:8101, outline border). The landing page after
// sign-in, with no sidebar (components/Shell.tsx). A built module opens at the first page the role may open, and is
// left out when the role may open none; a module with no pages yet says it is coming soon.
const card =
  "flex w-[240px] cursor-pointer flex-col items-center gap-4 rounded-[24px] border border-stroke2 bg-[rgb(214_247_255/0.5)] p-5 transition-colors hover:border-[#6e85e5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus dark:bg-[rgb(71_215_251/0.08)]";

function CardBody({ m }: { m: Module }) {
  return (
    <>
      <span className="flex h-8 w-10 items-center justify-center rounded-[12px] border border-stroke2 bg-bg5">
        <Icon name={m.icon} size={18} className="text-nav" />
      </span>
      <span className="flex w-[200px] flex-col gap-3 text-center leading-[1.22]">
        <span className="text-[16px] font-semibold tracking-[-0.64px] text-black">{m.name}</span>
        <span className="text-[14px] tracking-[-0.56px] text-nav">{m.access}</span>
        <span className="flex items-center justify-center gap-2 rounded-[12px] bg-button px-4 py-[6px] text-[14px] font-medium text-white">
          Open
          <Icon name="arrow-right" size={18} />
        </span>
      </span>
    </>
  );
}

export default function ModulesPage() {
  const me = useMe();
  const toast = useToast();
  const live = me ? modulesFor(me.permissions) : [];
  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <SectionHeader
        title={me ? `Welcome, ${me.name.split(" ")[0]}` : "Welcome"}
        subtitle={me && !live.length ? "Your role doesn't include any module yet. Ask an administrator for access." : "Select a module to continue."}
      />
      <section className="rounded-[16px] border border-stroke2 bg-primary px-5 py-10">
        <ul className="flex flex-wrap items-center justify-center gap-6">
          {!me && MODULES.map((m) => <li key={m.key} aria-hidden className="skeleton h-[181px] w-[240px] rounded-[24px]" />)}
          {me &&
            MODULES.map((m) => {
              const mine = live.find((l) => l.key === m.key);
              if (m.pages.length && !mine) return null;
              return (
                <li key={m.key}>
                  {mine ? (
                    <Link href={mine.pages[0]!.href} aria-label={`Open ${m.name}`} className={card}>
                      <CardBody m={m} />
                    </Link>
                  ) : (
                    <button
                      suppressHydrationWarning
                      type="button"
                      aria-label={`Open ${m.name} (coming soon)`}
                      onClick={() => toast.info(`${m.name} is coming soon`, "This module opens once its pages are ready.")}
                      className={card}
                    >
                      <CardBody m={m} />
                    </button>
                  )}
                </li>
              );
            })}
        </ul>
      </section>
    </div>
  );
}
