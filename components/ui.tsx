"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "./Icon";

// Every <button>/<input>/<textarea>/<select> in the app carries suppressHydrationWarning: browser extensions
// (password managers, form fillers) stamp attributes such as fdprocessedid onto form controls before React
// hydrates. It silences attribute mismatches on that one element only — never on its children.

/* ---------- Status icon, spinner, inline field error (shared by forms and components/feedback.tsx) ---------- */
export type Tone = "success" | "error" | "warning" | "info";
// 24px grid, 1.5px strokes like the Figma icon set
const ICON: Record<Tone, ReactNode> = {
  success: <path d="M8 12.5l2.5 2.5L16 9.5" />,
  error: <path d="M9.5 9.5l5 5m0-5l-5 5" />,
  warning: <path d="M12 8v5m0 3h.01" />,
  info: <path d="M12 11v5m0-8h.01" />,
};
const TONE_CLASS: Record<Tone, string> = {
  success: "text-success",
  error: "text-danger",
  warning: "text-warn",
  info: "text-link",
};
export function ToneIcon({ tone, size = 22 }: { tone: Tone; size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${TONE_CLASS[tone]}`}>
      <circle cx="12" cy="12" r="9" />
      {ICON[tone]}
    </svg>
  );
}

/** Small spinner for pending buttons (static under reduced motion, via the global rule in globals.css). */
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" className={`size-[18px] shrink-0 animate-spin ${className}`}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Inline message under a form field; pair the control with aria-invalid + aria-describedby={id}. */
export function FieldError({ id, message }: { id?: string; message?: string }) {
  if (!message) return null;
  return (
    <span id={id} role="alert" className="flex animate-rise items-center gap-[6px] text-[14px] font-medium text-danger">
      <ToneIcon tone="error" size={16} />
      {message}
    </span>
  );
}

/* ---------- Page header (title / subtitle / action, bottom divider) ---------- */
export function PageHeader({ title, subtitle, action }: { title: string; subtitle: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex w-full flex-wrap items-center justify-center gap-2 border-b border-stroke2 pb-[23px]">
      <div className="flex min-w-px flex-1 flex-col gap-1 text-black">
        <h1 className="text-[26px] font-semibold tracking-[-0.64px] sm:text-[32px]">{title}</h1>
        <p className="text-[16px] opacity-50">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

/* ---------- Buttons ---------- */
// Figma "Tab select/Button" (blue, plus icon)
export function PrimaryButton({ children, icon = "add", onClick }: { children: ReactNode; icon?: IconName | null; onClick?: () => void }) {
  return (
    <button suppressHydrationWarning type="button" onClick={onClick} className="flex shrink-0 cursor-pointer items-center gap-2 rounded-[16px] bg-button px-[18px] py-[14px] text-[18px] leading-6 font-medium whitespace-nowrap text-white">
      {icon && <Icon name={icon} className="text-white" />}
      {children}
    </button>
  );
}

// Figma "Button" (Report / Filter): label + trailing 18px icon
export function ToolButton({ label, icon, onClick, btnRef }: { label: string; icon: IconName; onClick?: () => void; btnRef?: RefObject<HTMLButtonElement | null> }) {
  return (
    <button suppressHydrationWarning ref={btnRef} type="button" onClick={onClick} className="flex shrink-0 cursor-pointer items-center gap-2 rounded-[18px] border border-stroke2 bg-bg5 px-[17px] py-[13px] text-[16px] leading-5 font-medium whitespace-nowrap text-nav">
      {label}
      <Icon name={icon} size={18} />
    </button>
  );
}

export function SearchBox({ value, onChange, className = "sm:w-[314px]" }: { value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <label className={`flex w-full items-center gap-2 rounded-[18px] border border-stroke2 bg-bg5 px-[17px] py-[13px] ${className}`}>
      <Icon name="search" size={18} className="text-nav" />
      <input suppressHydrationWarning
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search..."
        className="w-full min-w-0 bg-transparent text-[16px] leading-[20px] font-medium text-nav outline-none placeholder:text-nav"
      />
    </label>
  );
}

// Square icon button used in table "Actions"
export function IconButton({ icon, label, onClick, className = "", disabled = false }: { icon: IconName; label: string; onClick?: () => void; className?: string; disabled?: boolean }) {
  return (
    <button suppressHydrationWarning type="button" aria-label={label} onClick={onClick} disabled={disabled} aria-busy={disabled || undefined} className={`flex h-9 w-[46px] shrink-0 cursor-pointer items-center justify-center rounded-[12px] border border-stroke2 bg-bg5 transition-[background-color,opacity] hover:bg-[rgb(71_215_251/0.2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-wait disabled:opacity-50 ${className}`}>
      {disabled ? <Spinner className="text-nav" /> : <Icon name={icon} size={18} className="text-nav" />}
    </button>
  );
}

/* ---------- Status pills (Figma variant sets 1:7125, 1:7138, 1:7992, 1:7797) ---------- */
const BADGE: Record<string, [bg: string, border: string, text: string]> = {
  New: ["rgb(140 182 255/.3)", "rgb(140 182 255/.5)", "#8cb6ff"],
  Contacted: ["rgb(103 111 246/.3)", "rgb(103 111 246/.5)", "#676ff6"],
  Interested: ["rgb(101 238 136/.3)", "rgb(48 175 80/.5)", "#30a74e"],
  Proposal: ["rgb(251 146 60/.3)", "rgb(251 146 60/.5)", "#fb923c"],
  Converted: ["rgb(229 0 241/.3)", "rgb(229 0 241/.5)", "#e500f1"],
  Lost: ["rgb(249 74 74/.3)", "rgb(255 15 0/.5)", "#f94a4a"],
  Low: ["rgb(101 238 136/.3)", "rgb(48 175 80/.5)", "#30a74e"],
  Medium: ["rgb(255 136 0/.2)", "rgb(255 136 0/.5)", "#f80"],
  High: ["rgb(249 74 74/.2)", "rgb(249 74 74/.5)", "#f94a4a"],
  Pending: ["rgb(255 136 0/.3)", "rgb(255 136 0/.5)", "#f80"],
  Completed: ["rgb(101 238 136/.3)", "rgb(48 175 80/.5)", "#30a74e"],
  Overdue: ["rgb(249 74 74/.3)", "rgb(249 74 74/.5)", "#f80"],
  Active: ["rgb(101 238 136/.2)", "rgb(48 167 78/.5)", "#4ade80"],
  Inactive: ["rgb(249 74 74/.2)", "rgb(249 74 74/.5)", "#f94a4a"],
};

export function Badge({ label, width, className = "" }: { label: string; width?: number; className?: string }) {
  const [bg, border, color] = BADGE[label] ?? BADGE.New;
  return (
    <span
      className={`inline-flex items-center justify-center rounded-[19px] border px-[7px] py-[3px] text-[14px] leading-[17px] whitespace-nowrap ${className}`}
      style={{ background: bg, borderColor: border, color, width }}
    >
      {label}
    </span>
  );
}

/* ---------- Empty and failed states for tables and lists (loading: components/skeletons.tsx) ---------- */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b border-stroke2 py-10 text-center text-[16px] text-muted">
      {children}
    </p>
  );
}

/** A first load that failed: says so, with a retry (a skeleton never stands in for an error). */
export function LoadFailed({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <EmptyState>
      Couldn&apos;t load the {what}.
      <button suppressHydrationWarning type="button" onClick={onRetry} className="cursor-pointer font-semibold text-link hover:underline">
        Try again
      </button>
    </EmptyState>
  );
}

/* ---------- Pagination ---------- */
// Controlled when `onPage` is given (server paging); shows up to 5 page numbers around the current one.
export function Pagination({ label, pages = 4, page: current, onPage }: { label: string; pages?: number; page?: number; onPage?: (page: number) => void }) {
  const [local, setLocal] = useState(1);
  const page = current ?? local;
  const go = (p: number) => (onPage ?? setLocal)(Math.min(Math.max(1, p), pages));
  const first = Math.max(1, Math.min(page - 2, pages - 4));
  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-3 py-5">
      <p className="text-[12px] text-muted">{label}</p>
      <div className="flex items-center gap-[6px]">
        {Array.from({ length: Math.min(5, pages) }, (_, i) => first + i).map((n) => (
          <button suppressHydrationWarning
            key={n}
            type="button"
            aria-current={n === page ? "page" : undefined}
            onClick={() => go(n)}
            className={`flex h-8 cursor-pointer items-center justify-center rounded-[4px] px-3 text-[14px] ${n === page ? "bg-stroke text-white" : "text-muted"}`}
          >
            {n}
          </button>
        ))}
        <button suppressHydrationWarning type="button" aria-label="Next page" onClick={() => go(page + 1)} disabled={page >= pages} className="cursor-pointer text-nav disabled:cursor-default disabled:opacity-30">
          <Icon name="arrow-right" />
        </button>
      </div>
    </div>
  );
}

/* ---------- Overlays ---------- */
// Open overlays, innermost last. Escape closes only the top one: a dropdown inside a form closes and the form stays
// open with what was typed (every overlay used to close at once).
const layers: object[] = [];
function useEscape(open: boolean, onClose: () => void) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const layer = {};
    layers.push(layer);
    const h = (e: KeyboardEvent) => e.key === "Escape" && layers.at(-1) === layer && close.current();
    window.addEventListener("keydown", h);
    return () => {
      window.removeEventListener("keydown", h);
      layers.splice(layers.indexOf(layer), 1);
    };
  }, [open]);
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keyboard focus moves into `box` when `open` turns true and goes back to whatever had it when it closes. */
function useFocusReturn(open: boolean, box: RefObject<HTMLElement | null>, first: (el: HTMLElement) => HTMLElement | null) {
  const pick = useRef(first);
  useEffect(() => {
    pick.current = first;
  });
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const el = box.current;
    if (el && !el.contains(document.activeElement)) pick.current(el)?.focus({ preventScroll: true }); // unless something inside took it (autoFocus)
    return () => {
      // Only when focus was left inside (or dropped with the closed overlay): a deliberate move elsewhere stays.
      const lost = !document.activeElement || document.activeElement === document.body || el?.contains(document.activeElement);
      if (lost && opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open, box]);
}

// Figma overlay: CENTER (or TOP_CENTER), black 50% backdrop, close on click outside, instant.
export function Modal({ open, onClose, title, children, className = "w-[700px]", top = false }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
  top?: boolean;
}) {
  useEscape(open, onClose);
  const box = useRef<HTMLDivElement>(null);
  // The dialog itself takes focus on open (screen readers announce its title; the next Tab reaches the first control).
  useFocusReturn(open, box, (el) => el);
  if (!open) return null;
  // Tab and Shift+Tab wrap inside the dialog. Focus in a dropdown (rendered outside it) is left to that dropdown.
  const keepFocusInside = (e: React.KeyboardEvent) => {
    const el = box.current;
    if (e.key !== "Tab" || !el?.contains(document.activeElement)) return;
    const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.getClientRects().length > 0);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  return (
    <div className={`fixed inset-0 z-50 flex justify-center bg-scrim/50 p-4 ${top ? "items-start" : "items-center"}`} onMouseDown={onClose}>
      <div
        ref={box}
        role="dialog"
        aria-modal
        aria-label={title}
        tabIndex={-1}
        onKeyDown={keepFocusInside}
        onMouseDown={(e) => e.stopPropagation()}
        className={`relative flex max-h-[calc(100dvh-32px)] max-w-full flex-col gap-6 overflow-y-auto rounded-[24px] border border-stroke2 bg-primary p-5 outline-none sm:p-8 ${className}`}
      >
        <div className="flex w-full items-start border-b border-stroke2 pr-8 pb-8">
          <h2 className="text-[22px] font-medium text-black sm:text-[28px]">{title}</h2>
        </div>
        {/* Figma close control: 24px, centred 47px from the right / 45px from the top of every overlay */}
        <button
          suppressHydrationWarning
          type="button"
          aria-label={`Close ${title.replace(/[?.!:]+$/, "").toLowerCase()} dialog`} // "Delete lead?" → "Close delete lead dialog"
          onClick={onClose}
          className="absolute top-[33px] right-[35px] cursor-pointer rounded-[6px] text-black transition-opacity hover:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <Icon name="close" />
        </button>
        {children}
      </div>
    </div>
  );
}

export function ModalActions({ onCancel, onDone, doneLabel = "Done", pending = false, pendingLabel = "Saving…" }: {
  onCancel: () => void;
  onDone: () => void;
  doneLabel?: string;
  pending?: boolean; // request in flight: Done shows a spinner and cannot be pressed again
  pendingLabel?: string;
}) {
  return (
    <div className="flex items-center justify-end gap-[6px]">
      <button suppressHydrationWarning type="button" onClick={onCancel} className="h-10 cursor-pointer rounded-[12px] border border-button bg-white px-4 dark:bg-transparent text-[16px] font-medium text-black transition-colors hover:bg-bg5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
        Cancel
      </button>
      <button
        suppressHydrationWarning
        type="button"
        onClick={onDone}
        disabled={pending}
        aria-busy={pending}
        className="flex h-10 cursor-pointer items-center gap-2 rounded-[12px] bg-button px-4 text-[16px] font-medium text-white transition-[background-color,transform] hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:scale-[0.98] disabled:cursor-wait disabled:opacity-80"
      >
        {pending && <Spinner />}
        {pending ? pendingLabel : doneLabel}
      </button>
    </div>
  );
}

// Figma overlay: MANUAL position relative to the trigger, optional 25% backdrop, close on click outside.
export function Popover({ anchor, open, onClose, dx = 0, dy = 0, backdrop = true, children }: {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  dx?: number;
  dy?: number;
  backdrop?: boolean;
  children: ReactNode;
}) {
  useEscape(open, onClose);
  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", onClose);
    return () => window.removeEventListener("resize", onClose);
  }, [open, onClose]);
  // Keyboard users land on the first option (the panel is rendered at the end of the page, out of Tab reach) and
  // return to the trigger when it closes.
  const panel = useRef<HTMLDivElement | null>(null);
  useFocusReturn(open, panel, (el) => el.querySelector<HTMLElement>(FOCUSABLE));
  if (!open) return null;
  // Position is read from the trigger when the panel mounts (no extra render pass).
  const place = (el: HTMLDivElement | null) => {
    panel.current = el;
    const r = el && anchor.current?.getBoundingClientRect();
    if (!el || !r) return;
    el.style.left = `${Math.max(8, Math.min(r.left + dx, window.innerWidth - el.offsetWidth - 8))}px`;
    const top = r.top + dy;
    el.style.top = `${top}px`;
    // A long list (e.g. many roles) scrolls inside the panel instead of running off the bottom of the screen.
    // ponytail: never flips above the trigger; add that if a dropdown ever sits in the bottom ~160px.
    const room = window.innerHeight - top - 8;
    if (el.offsetHeight > room) {
      el.style.maxHeight = `${Math.max(room, 160)}px`;
      el.style.overflowY = "auto";
    }
  };
  // Portal to <body>: keeps the overlay out of any ancestor <label> (whose activation would
  // re-click the trigger) and out of scroll/stacking contexts such as modal bodies.
  return createPortal(
    <div className={`fixed inset-0 z-50 ${backdrop ? "bg-scrim/25" : ""}`} onMouseDown={onClose} onWheel={onClose}>
      <div
        ref={place}
        className="fixed overscroll-contain"
        onMouseDown={(e) => e.stopPropagation()}
        // Tab closes the panel and puts focus back on its trigger (the panel sits at the end of the page, so the
        // browser's own Tab would jump elsewhere); the next Tab carries on from the trigger.
        onKeyDown={(e) => {
          if (e.key !== "Tab" || e.defaultPrevented) return;
          e.preventDefault();
          onClose();
        }}
        // Scrolling a list inside the panel scrolls the list; any other wheel still closes the panel (it would drift from its trigger).
        onWheel={(e) => {
          for (let el = e.target as HTMLElement | null; el && el !== e.currentTarget.parentElement; el = el.parentElement)
            if (el.scrollHeight > el.clientHeight) return e.stopPropagation();
        }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

/* ---------- Filter dropdown (Figma 1:7751 collapsed / 1:7770 expanded): Leads, Customers, Follow-ups ---------- */
// A group opens its options; picking an option applies it, picking it again clears it.
export type FilterGroup = { key: string; label: string; options: { value: string; label: string }[] };
// Figma rows: 40 + 0.5px divider (Chrome draws the 0.5px border as 1px, so the height is fixed instead of padded)
const filterRow =
  "flex h-[40.5px] w-full cursor-pointer items-center px-4 text-left text-[16px] tracking-[-0.32px] text-nav last:h-10 focus-visible:bg-bg5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus";

export function FilterMenu({ groups, value, onPick }: { groups: FilterGroup[]; value: Record<string, string>; onPick: (key: string, value: string) => void }) {
  const [open, setOpen] = useState<string | null>(groups.length === 1 ? groups[0].key : null);
  return (
    <div className="flex w-[142px] flex-col divide-y-[0.5px] divide-stroke2 overflow-hidden rounded-[9px] border border-stroke2 bg-primary">
      {groups.map(({ key, label, options }) => [
        <button suppressHydrationWarning key={key} type="button" aria-expanded={open === key} onClick={() => setOpen(open === key ? null : key)} className={filterRow}>
          <span className="flex w-[94px] items-center justify-between">
            {label}
            <Icon name="arrow-right" size={18} className="rotate-90" />
          </span>
        </button>,
        ...(open === key
          ? options.map((o) => (
              <button
                suppressHydrationWarning
                key={`${key}:${o.value}`}
                type="button"
                aria-pressed={value[key] === o.value}
                onClick={() => onPick(key, value[key] === o.value ? "" : o.value)}
                className={`${filterRow} ${value[key] === o.value ? "text-selected" : ""}`}
              >
                {o.label}
              </button>
            ))
          : []),
      ])}
    </div>
  );
}

/* ---------- Form fields (modal forms) ---------- */
export function Field({ label, children, className = "", error, htmlFor, required = false }: { label: string; children: ReactNode; className?: string; error?: string; htmlFor?: string; required?: boolean }) {
  const text = (
    <span className="text-[18px] font-medium text-black sm:text-[20px]">
      {label}
      {required && <RequiredMark />}
    </span>
  );
  return (
    // The message sits outside the <label> so it is announced (role="alert") but not read as part of the field's name.
    // htmlFor: a composite control (PhoneInput) is named by id instead of being wrapped, so the label targets its input.
    <div className={`flex w-full min-w-0 flex-col gap-[6px] ${className}`}>
      {htmlFor ? (
        <>
          <label htmlFor={htmlFor} className="w-fit">
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

/** The asterisk after a required field's label. Screen readers get aria-required on the input instead. */
export const RequiredMark = () => (
  <span aria-hidden className="ml-1 text-danger">
    *
  </span>
);

const inputCls =
  "min-h-[46px] w-full rounded-[16px] border border-stroke2 bg-bg5 px-6 py-[12px] text-[16px] leading-5 font-medium text-black outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-black/50 focus:border-stroke focus:shadow-[0_0_0_3px_rgb(71_215_251/0.25)] aria-invalid:border-danger aria-invalid:focus:shadow-[0_0_0_3px_rgb(249_74_74/0.18)]";

export function TextInput(props: React.ComponentProps<"input">) {
  return <input suppressHydrationWarning {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function TextArea(props: React.ComponentProps<"textarea">) {
  return <textarea suppressHydrationWarning {...props} className={`${inputCls} h-[86px] resize-none ${props.className ?? ""}`} />;
}

// Dropdown field: input-styled trigger + designed option list (Figma 1:7760 / 1:7751 style). Options are plain
// strings, or { value, label } when labels can repeat (two leads or users with the same name): those are told apart
// by value, never by label. `display` overrides the trigger's text (e.g. while the options are still loading).
// With `onSearch` the list gets a search box, for lists too long to send whole (the caller fetches the matches).
export function SelectField({ value, options, onChange, placeholder, display, search, onSearch, icon = "arrow-right", iconSize = 18, iconClass = "rotate-90 text-black", className = "", invalid = false }: {
  value: string;
  options: (string | { value: string; label: string })[];
  onChange: (v: string) => void;
  placeholder?: string;
  display?: string;
  search?: string;
  onSearch?: (q: string) => void;
  icon?: IconName;
  iconSize?: number;
  iconClass?: string;
  className?: string; // extra trigger classes
  invalid?: boolean; // red outline, like an invalid text input
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState(0);
  const items = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  const shown = display ?? items.find((o) => o.value === value)?.label ?? value;
  return (
    <>
      <button suppressHydrationWarning
        ref={ref}
        type="button"
        data-invalid={invalid || undefined}
        onClick={() => {
          setWidth(ref.current?.offsetWidth ?? 0);
          setOpen(true);
        }}
        className={`${inputCls} flex cursor-pointer items-center justify-between text-left data-invalid:border-danger ${className}`}
      >
        <span className={shown ? "" : "opacity-50"}>{shown || placeholder}</span>
        <Icon name={icon} size={iconSize} className={iconClass} />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} dy={50}>
        <div className="overflow-hidden rounded-[9px] border border-stroke2 bg-primary" style={{ width }}>
          {onSearch && (
            <input
              suppressHydrationWarning
              type="search"
              aria-label="Search"
              placeholder="Search…"
              value={search ?? ""}
              onChange={(e) => onSearch(e.target.value)}
              className="w-full border-b-[0.5px] border-stroke2 bg-bg5 px-4 py-[10px] text-[16px] tracking-[-0.32px] text-black outline-none placeholder:text-black/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
            />
          )}
          <ul>
            {items.map((o) => (
              <li key={o.value}>
                <button suppressHydrationWarning
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className="w-full cursor-pointer border-b-[0.5px] border-stroke2 px-4 py-[10px] text-left text-[16px] tracking-[-0.32px] text-nav last:border-b-0 hover:bg-bg5 focus-visible:bg-bg5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
                >
                  {o.label}
                </button>
              </li>
            ))}
          </ul>
          {onSearch && !items.length && <p className="px-4 py-[10px] text-[14px] text-nav opacity-70">No matches</p>}
        </div>
      </Popover>
    </>
  );
}
