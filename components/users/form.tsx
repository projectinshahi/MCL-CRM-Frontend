import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { FIELD_LABEL, FieldError, RequiredMark } from "@/components/ui";

// User / Role overlays (1:7919, 1:7950, 1:7850, 1:7806): dark 1px stroke, wider action buttons.
export const USER_MODAL = "border-[#1e2834]! dark:border-stroke2!";
export const WIDE_ACTIONS = "[&_button]:px-5";

export function UField({ label, gap = "gap-1.5", children, error, htmlFor, required = false }: { label: string; gap?: string; children: ReactNode; error?: string; htmlFor?: string; required?: boolean }) {
  const text = (
    <span className={FIELD_LABEL}>
      {label}
      {required && <RequiredMark />}
    </span>
  );
  return (
    <div className={`flex w-full min-w-0 flex-col ${gap}`}>
      {htmlFor ? (
        <>
          <label htmlFor={htmlFor} className="flex w-fit">
            {text}
          </label>
          {children}
        </>
      ) : (
        <label className="contents">
          {text}
          {children}
        </label>
      )}
      <FieldError message={error} />
    </div>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <p className={FIELD_LABEL}>{children}</p>;
}

// Permission chip (role cards, Edit Role)
export function Chip({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <span className="relative shrink-0 rounded-full border border-stroke2 bg-[rgb(71_215_251/0.2)] px-3 py-1 text-[13px] font-medium whitespace-nowrap text-nav">
      {label}
      {children}
    </span>
  );
}

// Create New Role / Permissions pills. Figma: Ellipse 45 ON_CLICK → CHANGE_TO "Property 1=Variant2" (1:4851), instant.
// Options are the API's permission catalogue; values are permission codes.
export function PermissionPills({ options, value, onToggle }: { options: { code: string; label: string }[]; value: string[]; onToggle: (p: string) => void }) {
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {options.map(({ code: p, label }) => {
          const on = value.includes(p);
          return (
            <button suppressHydrationWarning
              key={p}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(p)}
              className="flex min-w-[150px] cursor-pointer items-center gap-2 rounded-full border border-stroke2 bg-[rgb(71_215_251/0.2)] py-1 pr-3.5 pl-1 text-[14px] font-medium whitespace-nowrap text-nav focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <span className={`size-6 shrink-0 rounded-full border border-[#104b58] dark:border-stroke ${on ? "bg-[#848bff]" : "bg-[rgb(66_66_66/0.2)] dark:bg-[rgb(255_255_255/0.14)]"}`} />
              {label}
            </button>
          );
        })}
      </div>
      {/* All Records is not a page: roles were given it to "open the modules", and then saw everyone's data. */}
      {options.some((o) => o.code === "all_records") && (
        <p className="text-[13px] text-nav opacity-80">
          The pages a role can open come from the other permissions. <b className="font-semibold">All Records</b> lets it see every user&apos;s
          leads, customers and follow-ups in those pages; without it, people see only the records they own or are assigned to.
        </p>
      )}
    </>
  );
}

export const toggle = (list: string[], p: string) => (list.includes(p) ? list.filter((x) => x !== p) : [...list, p]);

// Role Name input with the designed caret (decorative: role names are typed)
export function CaretInput({ caret, children }: { caret: string; children: ReactNode }) {
  return (
    <div className="relative w-full">
      {children}
      <Icon name="caret-down" size={20} className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${caret}`} />
    </div>
  );
}
