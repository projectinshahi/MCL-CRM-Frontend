import { Inter } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui";

// Figma: these screens set the page title in Inter Semi Bold / subtitle Inter Regular
// (Leads uses Montserrat, hence the shared PageHeader default). Root layout only loads Inter 700.
export const inter = Inter({ subsets: ["latin"] });

export function SectionHeader({ title, subtitle, action }: { title: string; subtitle: ReactNode; action?: ReactNode }) {
  return (
    <div className={`${inter.className} [&_h1]:leading-[round(1.21em,1px)] [&_p]:leading-[round(1.21em,1px)]`}>
      <PageHeader title={title} subtitle={subtitle} action={action && <div className="font-sans">{action}</div>} />
    </div>
  );
}

// Underline tabs (User | Role, Lead Sources | Lead Status). Prototype: click → NAVIGATE, instant.
export function UnderlineTabs({ tabs, active, className = "font-sans" }: {
  tabs: { label: string; href: string; cls: string }[];
  active: number;
  className?: string;
}) {
  return (
    <nav className={`flex items-center gap-4 overflow-x-auto ${className}`}>
      {tabs.map((t, i) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={i === active ? "page" : undefined}
          className={`flex shrink-0 justify-center pb-2 text-[15px] font-medium whitespace-nowrap ${t.cls} ${
            i === active ? "border-b-2 border-[#6e85e5] text-black" : "text-nav opacity-70 hover:opacity-100"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
