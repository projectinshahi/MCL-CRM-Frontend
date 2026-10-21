"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "./Icon";
import { place } from "@/lib/place";
import { LABEL_TONE, stageTone, type StatusTone } from "@/lib/status";

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
    <svg aria-hidden viewBox="0 0 24 24" fill="none" className={`size-4 shrink-0 animate-spin ${className}`}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Inline message under a form field; pair the control with aria-invalid + aria-describedby={id}. */
export function FieldError({ id, message }: { id?: string; message?: string }) {
  if (!message) return null;
  return (
    <span id={id} role="alert" className="flex animate-rise items-center gap-1.5 text-[13px] font-medium text-danger">
      <ToneIcon tone="error" size={16} />
      {message}
    </span>
  );
}

/* ---------- Page header (title / subtitle / action, bottom divider) ---------- */
export function PageHeader({ title, subtitle, action }: { title: string; subtitle: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex w-full flex-wrap items-center justify-center gap-2 border-b border-stroke2 pb-4">
      <div className="flex min-w-px flex-1 flex-col gap-0.5 text-black">
        <h1 className="text-[20px] font-semibold tracking-[-0.4px] sm:text-[24px]">{title}</h1>
        <p className="text-[14px] opacity-60">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

/* ---------- Buttons ---------- */
// Figma "Tab select/Button" (blue, plus icon)
export function PrimaryButton({ children, icon = "add", onClick }: { children: ReactNode; icon?: IconName | null; onClick?: () => void }) {
  return (
    <button suppressHydrationWarning type="button" onClick={onClick} className="flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-[12px] bg-button px-4 text-[14px] font-medium whitespace-nowrap text-white transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
      {icon && <Icon name={icon} size={20} className="text-white" />}
      {children}
    </button>
  );
}

// Figma "Button" (Report / Filter): label + trailing 18px icon
export function ToolButton({ label, icon, onClick, btnRef, count = 0, busy = false }: {
  label: string;
  icon: IconName;
  onClick?: () => void;
  btnRef?: RefObject<HTMLButtonElement | null>;
  count?: number; // e.g. active filters: shown as a small number, and read out with the label
  busy?: boolean; // a download in progress: a spinner, and no second click
}) {
  return (
    <button
      suppressHydrationWarning
      ref={btnRef}
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-busy={busy || undefined}
      aria-label={count ? `${label}, ${count} active` : undefined}
      className="flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-[12px] border border-stroke2 bg-bg5 px-3.5 text-[14px] font-medium whitespace-nowrap text-nav transition-colors hover:bg-[rgb(71_215_251/0.2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-wait disabled:opacity-70"
    >
      {label}
      {count > 0 && <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-button px-1 text-[11px] leading-none font-semibold text-white">{count}</span>}
      {busy ? <Spinner /> : <Icon name={icon} size={16} />}
    </button>
  );
}

export function SearchBox({ value, onChange, className = "sm:w-[260px]" }: { value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <label className={`flex h-10 w-full items-center gap-2 rounded-[12px] border border-stroke2 bg-bg5 px-3.5 transition-[border-color,box-shadow] focus-within:border-stroke focus-within:shadow-[0_0_0_3px_rgb(71_215_251/0.25)] ${className}`}>
      <Icon name="search" size={16} className="text-nav" />
      <input suppressHydrationWarning
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search..."
        className="w-full min-w-0 bg-transparent text-[14px] leading-5 font-medium text-nav outline-none placeholder:text-nav/70"
      />
    </label>
  );
}

/** A table column `w` px wide at least, sharing any spare width in proportion, so a row always fills its card. */
export const col = (w: number) => ({ flex: `${w} 0 0`, minWidth: w });

// Square icon button used in table "Actions"
export function IconButton({ icon, label, onClick, className = "", disabled = false }: { icon: IconName; label: string; onClick?: () => void; className?: string; disabled?: boolean }) {
  return (
    <button suppressHydrationWarning type="button" aria-label={label} onClick={onClick} disabled={disabled} aria-busy={disabled || undefined} className={`flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[10px] border border-stroke2 bg-bg5 transition-[background-color,opacity] hover:bg-[rgb(71_215_251/0.2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-wait disabled:opacity-50 ${className}`}>
      {disabled ? <Spinner className="text-nav" /> : <Icon name={icon} size={16} className="text-nav" />}
    </button>
  );
}

/* ---------- Status pills (Figma variant sets 1:7125, 1:7138, 1:7992, 1:7797) ---------- */
// Tones come from lib/status.ts (meaning → colour). Dark text on a light tint, light text on a dark tint in dark mode:
// at least 4.5:1 in both. The Figma pills used the colour itself for the text (#8cb6ff on light blue ≈ 2:1).
const TONE: Record<StatusTone, { pill: string; dot: string }> = {
  sky: { pill: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-200", dot: "bg-sky-500" },
  indigo: { pill: "border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-400/30 dark:bg-indigo-400/10 dark:text-indigo-200", dot: "bg-indigo-500" },
  teal: { pill: "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-400/30 dark:bg-teal-400/10 dark:text-teal-200", dot: "bg-teal-500" },
  violet: { pill: "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-400/30 dark:bg-violet-400/10 dark:text-violet-200", dot: "bg-violet-500" },
  cyan: { pill: "border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-400/30 dark:bg-cyan-400/10 dark:text-cyan-200", dot: "bg-cyan-500" },
  pink: { pill: "border-pink-200 bg-pink-50 text-pink-800 dark:border-pink-400/30 dark:bg-pink-400/10 dark:text-pink-200", dot: "bg-pink-500" },
  orange: { pill: "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-400/30 dark:bg-orange-400/10 dark:text-orange-200", dot: "bg-orange-500" },
  lime: { pill: "border-lime-300 bg-lime-50 text-lime-800 dark:border-lime-400/30 dark:bg-lime-400/10 dark:text-lime-200", dot: "bg-lime-500" },
  green: { pill: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200", dot: "bg-emerald-500" },
  red: { pill: "border-red-200 bg-red-50 text-red-800 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-200", dot: "bg-red-500" },
  amber: { pill: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200", dot: "bg-amber-500" },
  slate: { pill: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-400/30 dark:bg-slate-400/10 dark:text-slate-200", dot: "bg-slate-400" },
};

/** A status pill: priorities and states by their label (lib/status.ts LABEL_TONE), or an explicit tone. */
export function Badge({ label, tone, width, className = "" }: { label: string; tone?: StatusTone; width?: number; className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-[12px] leading-4 font-medium whitespace-nowrap ${TONE[tone ?? LABEL_TONE[label] ?? "slate"].pill} ${className}`}
      style={{ minWidth: width }}
    >
      {label}
    </span>
  );
}

/** A lead stage: coloured by what it means (won green, lost red, the rest fixed hues), the same on every screen. */
export function StageBadge({ status, width, className }: { status: { name: string; isWon?: boolean; isLost?: boolean }; width?: number; className?: string }) {
  return <Badge label={status.name} tone={stageTone(status)} width={width} className={className} />;
}

/** The stage's colour as a small dot (pipeline column headers). */
export function StageDot({ status }: { status: { name: string; isWon?: boolean; isLost?: boolean } }) {
  return <span aria-hidden className={`size-2 shrink-0 rounded-full ${TONE[stageTone(status)].dot}`} />;
}

/* ---------- Empty and failed states for tables and lists (loading: components/skeletons.tsx) ---------- */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b border-stroke2 py-8 text-center text-[14px] text-muted">
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
    <div className="flex w-full flex-wrap items-center justify-between gap-3 py-4">
      <p className="text-[12px] text-muted">{label}</p>
      <div className="flex items-center gap-[6px]">
        {Array.from({ length: Math.min(5, pages) }, (_, i) => first + i).map((n) => (
          <button suppressHydrationWarning
            key={n}
            type="button"
            aria-current={n === page ? "page" : undefined}
            onClick={() => go(n)}
            className={`flex h-8 min-w-8 cursor-pointer items-center justify-center rounded-[8px] px-2.5 text-[13px] font-medium ${n === page ? "bg-stroke text-white" : "text-muted hover:bg-bg5"}`}
          >
            {n}
          </button>
        ))}
        <button suppressHydrationWarning type="button" aria-label="Next page" onClick={() => go(page + 1)} disabled={page >= pages} className="flex size-8 cursor-pointer items-center justify-center rounded-[8px] text-nav hover:bg-bg5 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent">
          <Icon name="arrow-right" size={20} />
        </button>
      </div>
    </div>
  );
}

/* ---------- Overlays ---------- */
// Open overlays, innermost last. Escape closes only the top one: a dropdown inside a form closes and the form stays
// open with what was typed (every overlay used to close at once).
const layers: object[] = [];
export function useEscape(open: boolean, onClose: () => void) {
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

/**
 * Keyboard focus moves into `box` when `open` turns true and goes back to whatever had it when it closes. It lands on
 * the box's [data-autofocus] element if there is one, else on `first(box)`. Popups mark that element instead of using
 * React's autoFocus, which moves focus before this notes where it was, leaving nothing to go back to.
 */
function useFocusReturn(open: boolean, box: RefObject<HTMLElement | null>, first: (el: HTMLElement) => HTMLElement | null) {
  const pick = useRef(first);
  useEffect(() => {
    pick.current = first;
  });
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const el = box.current;
    if (el && !el.contains(document.activeElement)) {
      const marked = el.querySelector<HTMLElement>("[data-autofocus]");
      if (marked) marked.focus(); // scrolled into view in a long list, as autoFocus would
      else pick.current(el)?.focus({ preventScroll: true });
    }
    return () => {
      // Only when focus was left inside (or dropped with the closed overlay): a deliberate move elsewhere stays.
      const lost = !document.activeElement || document.activeElement === document.body || el?.contains(document.activeElement);
      if (lost && opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open, box]);
}

// Visited pages stay mounted, hidden, so Back / Forward shows them as they were (cacheComponents), popups included.
// A popup still open on a page that was left is closed when that page shows again, before it is painted: always for a
// dropdown or menu, and for a dialog unless something was typed or picked in it (that one stays, input and all).
let navigations = 0;
/** The Shell calls this on every change of page. */
export const noteNavigation = () => void navigations++;

function useCloseOnReturn(open: boolean, close: () => void, editedRef?: RefObject<boolean>) {
  const done = useRef(close);
  useEffect(() => {
    done.current = close;
  });
  const openedAt = useRef<number | null>(null);
  // Runs when the popup opens and again whenever its hidden page is shown (layout effects are set up anew then).
  useLayoutEffect(() => {
    if (!open) {
      openedAt.current = null;
      return;
    }
    if (openedAt.current === null) {
      openedAt.current = navigations;
      if (editedRef) editedRef.current = false;
    } else if (openedAt.current !== navigations) {
      if (editedRef?.current) openedAt.current = navigations;
      else done.current();
    }
  }, [open, editedRef]);
}

// Figma overlay: black 50% backdrop over the whole window, header and sidebar included; close on click outside,
// instant; the dialog is centred in the window. Rendered at the end of <body> (like the dropdowns), so no ancestor's
// stacking or transform can put it under the header or the sidebar. Nothing behind it scrolls meanwhile (the window
// never scrolls, and the page is a scroller of its own that nothing here chains into), and the dialog's own scrolling
// never carries over.
export function Modal({ open, onClose, title, children, className = "w-[560px]" }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  useEscape(open, onClose);
  const box = useRef<HTMLDivElement>(null);
  // The dialog itself takes focus on open (screen readers announce its title; the next Tab reaches the first control).
  useFocusReturn(open, box, (el) => el);
  const edited = useRef(false); // something typed or picked since it opened
  useCloseOnReturn(open, onClose, edited);
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
  return createPortal(
    // data-backdrop: a press here while one of its dropdowns is open closes only the dropdown (Popover). A press that
    // closes the dialog leaves focus alone (preventDefault), so it goes back to the dialog's opener, not to the page.
    <div
      data-backdrop
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/50 p-4"
      onMouseDown={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        ref={box}
        role="dialog"
        aria-modal
        aria-label={title}
        tabIndex={-1}
        onKeyDown={keepFocusInside}
        onMouseDown={(e) => e.stopPropagation()}
        // Typed into a field, or picked from one of its dropdowns (rendered outside, but their events come here)
        onChange={() => {
          edited.current = true;
        }}
        onClick={(e) => {
          if ((e.target as Element).closest?.("[role=option]")) edited.current = true;
        }}
        className={`relative flex max-h-[calc(100dvh-32px)] max-w-full flex-col gap-5 overflow-y-auto overscroll-contain rounded-[20px] border border-stroke2 bg-primary p-5 outline-none sm:p-6 ${className}`}
      >
        {/* Pinned while a long form scrolls under it (the close button with it); ModalActions is pinned at the bottom. */}
        <div className="sticky -top-5 z-10 -mx-5 -mt-5 flex w-auto items-center justify-between gap-4 border-b border-stroke2 bg-primary px-5 py-4 sm:-top-6 sm:-mx-6 sm:-mt-6 sm:px-6">
          <h2 className="min-w-0 text-[18px] font-semibold tracking-[-0.36px] break-words text-black sm:text-[20px]">{title}</h2>
          <button
            suppressHydrationWarning
            type="button"
            aria-label={`Close ${title.replace(/[?.!:]+$/, "").toLowerCase()} dialog`} // "Delete lead?" → "Close delete lead dialog"
            onClick={onClose}
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[8px] text-black transition-colors hover:bg-bg5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
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
    // Pinned to the bottom of a dialog whose form scrolls, so Save / Cancel never scroll out of reach.
    <div className="sticky -bottom-5 z-10 -mx-5 flex items-center justify-end gap-2 border-t border-stroke2 bg-primary px-5 py-4 sm:-bottom-6 sm:-mx-6 sm:px-6">
      <button suppressHydrationWarning type="button" onClick={onCancel} className="h-10 cursor-pointer rounded-[12px] border border-button bg-white px-4 dark:bg-transparent text-[14px] font-medium text-black transition-colors hover:bg-bg5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
        Cancel
      </button>
      <button
        suppressHydrationWarning
        type="button"
        onClick={onDone}
        disabled={pending}
        aria-busy={pending}
        className="flex h-10 cursor-pointer items-center gap-2 rounded-[12px] bg-button px-4 text-[14px] font-medium text-white transition-[background-color,transform] hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:scale-[0.98] disabled:cursor-wait disabled:opacity-80"
      >
        {pending && <Spinner />}
        {pending ? pendingLabel : doneLabel}
      </button>
    </div>
  );
}

/**
 * A dropdown menu joined to its trigger (lib/place.ts): under it, or above when there is no room below, their borders
 * overlapping into one line and the corners where they meet squared (data-joined on both, app/globals.css), so the
 * two read as one control. Its left (`start`) or right (`end`) edge lines up with the trigger's; `fit` makes it
 * exactly as wide as the trigger (a form field). The wrapper is the menu's box for every dropdown: the panels inside
 * bring only their content. It stays attached while the page or a dialog
 * scrolls, the window resizes or its content changes size, and closes once its trigger is out of sight (scrolled
 * away, or under a dialog's pinned header or footer). Nothing covers the rest of the app: the trigger is never
 * dimmed, a dialog under the menu goes on scrolling, and a press elsewhere closes the menu and still lands where it
 * was aimed, except on a dialog's backdrop, where it closes only the menu.
 */
export function Popover({ anchor, open, onClose, align = "start", fit = false, children }: {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  align?: "start" | "end";
  fit?: boolean;
  children: ReactNode;
}) {
  useEscape(open, onClose);
  // Keyboard users land on the first option (the panel is rendered at the end of the page, out of Tab reach) and
  // return to the trigger when it closes.
  const panel = useRef<HTMLDivElement | null>(null);
  useFocusReturn(open, panel, (el) => el.querySelector<HTMLElement>(FOCUSABLE));
  useCloseOnReturn(open, onClose);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  // Placed before the first paint (no flash in a corner), then again on every scroll, resize and size change.
  useLayoutEffect(() => {
    const el = panel.current;
    if (!open || !el) return;
    // The trigger whose corners are squared right now; unmarked when the menu closes or the anchor moves elsewhere.
    let joined: HTMLElement | null = null;
    const unjoin = () => joined?.removeAttribute("data-joined");
    const position = () => {
      const trigger = anchor.current;
      if (trigger !== joined) unjoin();
      if (!trigger) return;
      const r = trigger.getBoundingClientRect();
      const seen = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2).find((x) => !el.contains(x));
      if (!seen || !trigger.contains(seen)) return close.current();
      el.style.maxHeight = "";
      if (fit) el.style.width = `${r.width}px`;
      const size = { width: fit ? r.width : el.offsetWidth, height: el.offsetHeight };
      const spot = place(r, size, { width: innerWidth, height: innerHeight }, align);
      el.style.top = `${spot.top}px`;
      el.style.left = `${spot.left}px`;
      el.style.maxHeight = spot.maxHeight ? `${spot.maxHeight}px` : "";
      el.style.overflowY = spot.maxHeight ? "auto" : "";
      el.toggleAttribute("data-up", spot.up);
      el.setAttribute("data-joined", spot.join.menu.join(" "));
      trigger.setAttribute("data-joined", spot.join.trigger.join(" "));
      joined = trigger;
    };
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(position);
    };
    const outside = (e: PointerEvent) => {
      const target = e.target as Element;
      if (el.contains(target) || anchor.current?.contains(target)) return; // the trigger toggles the menu itself
      // On the dim itself no mousedown follows, so the dialog stays open; a press on another field of the dialog goes
      // ahead (focus, caret).
      if (target.matches?.("[data-backdrop]")) e.preventDefault();
      close.current();
    };
    position();
    const resized = new ResizeObserver(update);
    resized.observe(el);
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("scroll", update, true); // any scroller: the page, a dialog, a table
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      unjoin();
      resized.disconnect();
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, anchor, align, fit]);
  if (!open) return null;
  // Portal to <body>: keeps the menu out of any ancestor <label> (whose activation would re-click the trigger) and
  // out of clipping and stacking contexts such as dialog bodies and table scrollers. Later in <body> than an open
  // dialog, so it is drawn above it.
  return createPortal(
    <div
      ref={panel}
      // The shared menu box. Its shadow falls away from the trigger (down, or up when it opens above), never onto it.
      className="fixed z-50 overflow-hidden overscroll-contain rounded-[12px] border border-stroke2 bg-primary shadow-[0_16px_24px_-8px_rgb(21_46_175/0.16)] data-up:shadow-[0_-16px_24px_-8px_rgb(21_46_175/0.16)]"
      onMouseDown={(e) => e.stopPropagation()}
      // Tab closes the panel and puts focus back on its trigger (the panel sits at the end of the page, so the
      // browser's own Tab would jump elsewhere); the next Tab carries on from the trigger.
      onKeyDown={(e) => {
        if (e.key !== "Tab" || e.defaultPrevented) return;
        e.preventDefault();
        onClose();
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

/* ---------- Filter dropdown (Figma 1:7751 collapsed / 1:7770 expanded): Leads, Customers, Follow-ups ---------- */
// A group opens its options; picking an option applies it, picking it again clears it.
export type FilterGroup = { key: string; label: string; options: { value: string; label: string }[] };
// 36px rows (the compact control height) with a 0.5px divider
const filterRow =
  "flex h-9 w-full cursor-pointer items-center px-3.5 text-left text-[14px] text-nav focus-visible:bg-bg5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus";

/** How many of `value`'s filters are set: the number on the Filter button. */
export const activeFilters = (value: object) => Object.values(value).filter(Boolean).length;

export function FilterMenu({ groups, value, onPick }: { groups: FilterGroup[]; value: Record<string, string | undefined>; onPick: (key: string, value: string) => void }) {
  const [open, setOpen] = useState<string | null>(groups.length === 1 ? groups[0].key : null);
  const chosen = groups.filter((g) => value[g.key]);
  return (
    <div className="flex w-[220px] flex-col divide-y-[0.5px] divide-stroke2">
      {groups.map(({ key, label, options }) => {
        // Each group says what is chosen in it, so the menu reads as the current filter at a glance.
        const current = options.find((o) => o.value === value[key])?.label;
        return [
          <button suppressHydrationWarning key={key} type="button" aria-expanded={open === key} onClick={() => setOpen(open === key ? null : key)} className={`${filterRow} h-auto! min-h-9 justify-between gap-2 py-1.5 font-medium`}>
            <span className="flex min-w-0 flex-col">
              {label}
              {current && <span className="truncate text-[12px] font-normal text-selected">{current}</span>}
            </span>
            <Icon name="arrow-right" size={16} className={`shrink-0 transition-transform ${open === key ? "-rotate-90" : "rotate-90"}`} />
          </button>,
          ...(open === key
            ? options.map((o) => (
                <button
                  suppressHydrationWarning
                  key={`${key}:${o.value}`}
                  type="button"
                  aria-pressed={value[key] === o.value}
                  onClick={() => onPick(key, value[key] === o.value ? "" : o.value)}
                  className={`${filterRow} h-auto! min-h-9 justify-between gap-2 bg-bg5/60 py-1.5 pl-6 hover:bg-bg5 ${value[key] === o.value ? "font-semibold text-selected" : ""}`}
                >
                  <span className="min-w-0 break-words">{o.label}</span>
                  {value[key] === o.value && <Icon name="mark" size={16} className="shrink-0 text-selected" />}
                </button>
              ))
            : []),
        ];
      })}
      {chosen.length > 0 && (
        <button suppressHydrationWarning type="button" onClick={() => chosen.forEach((g) => onPick(g.key, ""))} className={`${filterRow} font-semibold text-link`}>
          Clear all filters
        </button>
      )}
    </div>
  );
}

/* ---------- Form fields (modal forms) ---------- */
export function Field({ label, children, className = "", error, htmlFor, required = false }: { label: string; children: ReactNode; className?: string; error?: string; htmlFor?: string; required?: boolean }) {
  const text = (
    <span className={FIELD_LABEL}>
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

/** A form field's label text: one size in every form (Field, the user and role forms, the file lists). */
export const FIELD_LABEL = "text-[14px] font-medium text-black";

/** The asterisk after a required field's label. Screen readers get aria-required on the input instead. */
export const RequiredMark = () => (
  <span aria-hidden className="ml-1 text-danger">
    *
  </span>
);

const inputCls =
  "min-h-10 w-full rounded-[12px] border border-stroke2 bg-bg5 px-3.5 py-[9px] text-[14px] leading-5 font-medium text-black outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-black/50 focus:border-stroke focus:shadow-[0_0_0_3px_rgb(71_215_251/0.25)] aria-invalid:border-danger aria-invalid:focus:shadow-[0_0_0_3px_rgb(249_74_74/0.18)]";

export function TextInput(props: React.ComponentProps<"input">) {
  return <input suppressHydrationWarning {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function TextArea(props: React.ComponentProps<"textarea">) {
  return <textarea suppressHydrationWarning {...props} className={`${inputCls} h-20 resize-none ${props.className ?? ""}`} />;
}

// Dropdown field: input-styled trigger + designed option list (Figma 1:7760 / 1:7751 style). Options are plain
// strings, or { value, label } when labels can repeat (two leads or users with the same name): those are told apart
// by value, never by label. `display` overrides the trigger's text (e.g. while the options are still loading).
// With `onSearch` the list gets a search box, for lists too long to send whole (the caller fetches the matches).
export function SelectField({ value, options, onChange, placeholder, display, search, onSearch, icon = "arrow-right", iconSize = 16, iconClass = "rotate-90 text-black", className = "", invalid = false }: {
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
  const items = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  const shown = display ?? items.find((o) => o.value === value)?.label ?? value;
  const moveFocus = (e: React.KeyboardEvent<HTMLElement>) => {
    const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const to = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: buttons.length - 1 }[e.key];
    if (to === undefined || !buttons.length) return;
    e.preventDefault();
    buttons[Math.max(0, Math.min(buttons.length - 1, to))]!.focus();
  };
  return (
    <>
      <button suppressHydrationWarning
        ref={ref}
        type="button"
        data-invalid={invalid || undefined}
        onClick={() => setOpen((o) => !o)}
        className={`${inputCls} flex cursor-pointer items-center justify-between text-left data-invalid:border-danger ${className}`}
      >
        <span className={shown ? "" : "opacity-50"}>{shown || placeholder}</span>
        {/* Points up while the list is open */}
        <span className={`flex transition-transform ${open ? "rotate-180" : ""}`}>
          <Icon name={icon} size={iconSize} className={iconClass} />
        </span>
      </button>
      {/* Exactly as wide as the field, joined to it */}
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} fit>
        <>
          {onSearch && (
            <input
              suppressHydrationWarning
              type="search"
              aria-label="Search"
              placeholder="Search…"
              value={search ?? ""}
              onChange={(e) => onSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowDown") return;
                e.preventDefault();
                e.currentTarget.parentElement?.querySelector<HTMLButtonElement>("[role=option]")?.focus();
              }}
              className="w-full border-b-[0.5px] border-stroke2 bg-bg5 px-3.5 py-2 text-[14px] text-black outline-none placeholder:text-black/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
            />
          )}
          {/* A listbox: Up/Down/Home/End move between options, Enter or Space picks, Escape closes; the chosen one is
              marked and takes focus when the list opens (with a search box, typing comes first). */}
          <ul role="listbox" aria-label={placeholder ?? "Options"} onKeyDown={moveFocus}>
            {items.map((o) => {
              const chosen = o.value === value;
              return (
                <li key={o.value} role="none">
                  <button
                    suppressHydrationWarning
                    type="button"
                    role="option"
                    aria-selected={chosen}
                    data-autofocus={(chosen && !onSearch) || undefined}
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    className={`flex min-h-9 w-full cursor-pointer items-center justify-between gap-2 border-b-[0.5px] border-stroke2 px-3.5 py-2 text-left text-[14px] last:border-b-0 hover:bg-bg5 focus-visible:bg-bg5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus ${chosen ? "font-semibold text-selected" : "text-nav"}`}
                  >
                    <span className="min-w-0 break-words">{o.label}</span>
                    {chosen && <Icon name="mark" size={16} className="shrink-0 text-selected" />}
                  </button>
                </li>
              );
            })}
          </ul>
          {onSearch && !items.length && <p className="px-3.5 py-2 text-[13px] text-nav opacity-70">No matches</p>}
        </>
      </Popover>
    </>
  );
}
