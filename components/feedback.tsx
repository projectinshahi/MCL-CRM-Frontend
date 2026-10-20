"use client";

import { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api, ApiError, FLASH_KEY, setLoadErrorHandler } from "@/lib/api";
import { Modal, ToneIcon, type Tone } from "./ui";

/* =====================================================================================================
   App-wide feedback: toasts (success / error / warning / info), a styled confirmation dialog, and a
   "flash" toast that survives a full page reload (logout, expired session).
   Rules: success only after the API confirms; field errors stay inline next to the field (FieldError);
   toasts carry results and errors not tied to one field.
   ===================================================================================================== */

export type { Tone } from "./ui";
type Toast = { id: number; tone: Tone; title: string; detail?: string; leaving?: boolean };

// Errors stay up long enough to read; routine confirmations get out of the way.
const DURATION: Record<Tone, number> = { success: 4000, info: 4000, warning: 6000, error: 8000 };
const MAX_VISIBLE = 4;

type ToastApi = Record<Tone, (title: string, detail?: string) => void> & {
  /** Error toast from any thrown value: the server's own message as the detail, never stack traces. */
  apiError: (err: unknown, title: string) => void;
};
type ConfirmOptions = { title: string; message: ReactNode; confirmLabel: string; danger?: boolean };

const ToastCtx = createContext<ToastApi | null>(null);
const ConfirmCtx = createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null);

export const useToast = () => use(ToastCtx)!;
export const useConfirm = () => use(ConfirmCtx)!;

/** Queue a toast for the next page load (used right before a full-page redirect). */
export { flash } from "@/lib/api";

type RemoveOptions = Omit<ConfirmOptions, "danger"> & { path: string; success: string; successDetail?: string; failTitle: string };

/**
 * Styled confirm → DELETE → success toast once the API has answered (or an error toast).
 * `removing` is the id whose request is running, for that row's spinner.
 */
export function useRemove(onRemoved: () => void) {
  const toast = useToast();
  const confirm = useConfirm();
  const [removing, setRemoving] = useState<string | null>(null);
  const remove = async (id: string, o: RemoveOptions) => {
    if (removing === id || !(await confirm({ ...o, danger: true }))) return;
    setRemoving(id);
    try {
      await api(o.path, { method: "DELETE" });
      toast.success(o.success, o.successDetail);
      onRemoved(); // a failed list refresh is reported on its own ("Couldn't load the latest data")
    } catch (err) {
      toast.apiError(err, o.failTitle);
    } finally {
      setRemoving((r) => (r === id ? null : r)); // another row's delete may have started meanwhile: keep its spinner
    }
  };
  return { remove, removing };
}

export const errorDetail = (err: unknown) => (err instanceof ApiError ? err.message : "Something went wrong. Please try again.");

function ToastCard({ toast, onClose, onHover }: { toast: Toast; onClose: () => void; onHover: (hovering: boolean) => void }) {
  return (
    <div
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className={`pointer-events-auto flex w-full items-start gap-3 rounded-[16px] border border-stroke2 bg-primary py-[14px] pr-3 pl-4 shadow-[0_8px_24px_rgb(21_46_175/0.12)] transition-[opacity,translate] duration-200 sm:w-[380px] ${
        toast.leaving ? "translate-y-2 opacity-0" : "animate-rise"
      }`}
    >
      <ToneIcon tone={toast.tone} />
      <div className="flex min-w-0 flex-1 flex-col gap-[2px] pt-[1px]">
        <p className="text-[16px] font-semibold tracking-[-0.32px] text-black">{toast.title}</p>
        {toast.detail && <p className="text-[14px] break-words text-nav">{toast.detail}</p>}
      </div>
      <button suppressHydrationWarning type="button" aria-label="Dismiss notification" onClick={onClose} className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-nav opacity-60 transition-opacity hover:bg-bg5 hover:opacity-100">
        <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const nextId = useRef(1);

  const remove = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((ts) => ts.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 200); // exit transition
  }, []);

  const schedule = useCallback(
    (id: number, tone: Tone) => {
      clearTimeout(timers.current.get(id));
      timers.current.set(id, setTimeout(() => remove(id), DURATION[tone]));
    },
    [remove],
  );

  const show = useCallback(
    (tone: Tone, title: string, detail?: string) => {
      setToasts((ts) => {
        // The same message already on screen: keep one and restart its timer instead of stacking copies.
        const same = ts.find((t) => !t.leaving && t.tone === tone && t.title === title && t.detail === detail);
        if (same) {
          schedule(same.id, tone);
          return ts;
        }
        const id = nextId.current++;
        schedule(id, tone);
        const next = [...ts, { id, tone, title, detail }];
        const live = next.filter((t) => !t.leaving);
        if (live.length > MAX_VISIBLE) {
          const oldest = live[0]!.id;
          clearTimeout(timers.current.get(oldest));
          return next.filter((t) => t.id !== oldest);
        }
        return next;
      });
    },
    [schedule],
  );

  const [api] = useState<ToastApi>(() => ({
    success: (t, d) => show("success", t, d),
    error: (t, d) => show("error", t, d),
    warning: (t, d) => show("warning", t, d),
    info: (t, d) => show("info", t, d),
    apiError: (err, t) => show("error", t, errorDetail(err)),
  }));

  // A toast queued before a full reload (logout, expired session) is shown once, then forgotten.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(FLASH_KEY);
      if (raw) {
        sessionStorage.removeItem(FLASH_KEY);
        const f = JSON.parse(raw) as { tone: Tone; title: string; detail?: string };
        show(f.tone, f.title, f.detail);
      }
    } catch {
      // unreadable flash: ignore
    }
  }, [show]);

  // Background list loads (useApi) report failures here, so a failed refresh never hides a successful save.
  // Not 403: a load the role isn't allowed is a page it lacks, which the page itself explains ("No access").
  useEffect(() => {
    setLoadErrorHandler((err) => err.status !== 403 && show("error", "Couldn't load the latest data", errorDetail(err)));
    return () => setLoadErrorHandler(null);
  }, [show]);

  // ---------- confirmation dialog ----------
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setConfirmState({ ...o, resolve })), []);
  const settle = (ok: boolean) => {
    confirmState?.resolve(ok);
    setConfirmState(null);
  };

  const hover = (id: number, tone: Tone) => (hovering: boolean) =>
    hovering ? clearTimeout(timers.current.get(id)) : schedule(id, tone);
  const region = (assertive: boolean) => (
    <div role={assertive ? "alert" : "status"} aria-live={assertive ? "assertive" : "polite"} className="contents">
      {toasts
        .filter((t) => (t.tone === "error") === assertive)
        .map((t) => (
          <ToastCard key={t.id} toast={t} onClose={() => remove(t.id)} onHover={hover(t.id, t.tone)} />
        ))}
    </div>
  );

  return (
    <ToastCtx value={api}>
      <ConfirmCtx value={confirm}>
        {children}
        {/* Bottom-right on desktop, bottom full-width on phones: clear of page headers and primary actions. */}
        <section aria-label="Notifications" className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6">
          {region(false)}
          {region(true)}
        </section>
        <Modal open={!!confirmState} onClose={() => settle(false)} title={confirmState?.title ?? ""} className="w-[560px] gap-5!">
          {confirmState && (
            <>
              <div className="flex items-start gap-3 text-[16px] text-nav">
                <ToneIcon tone={confirmState.danger ? "warning" : "info"} />
                <div className="pt-[1px]">{confirmState.message}</div>
              </div>
              <div className="flex items-center justify-end gap-[6px]">
                <button suppressHydrationWarning type="button" onClick={() => settle(false)} className="h-10 cursor-pointer rounded-[12px] border border-button bg-white px-4 dark:bg-transparent text-[16px] font-medium text-black">
                  Cancel
                </button>
                <button
                  suppressHydrationWarning
                  type="button"
                  autoFocus
                  onClick={() => settle(true)}
                  className={`h-10 cursor-pointer rounded-[12px] px-4 text-[16px] font-medium text-white ${confirmState.danger ? "bg-danger" : "bg-button"}`}
                >
                  {confirmState.confirmLabel}
                </button>
              </div>
            </>
          )}
        </Modal>
      </ConfirmCtx>
    </ToastCtx>
  );
}
