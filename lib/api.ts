"use client";

import { useCallback, useEffect, useState } from "react";

// Thin client for the MCL-CRM-Backend API, reached same-origin through the /api rewrite in next.config.ts.
// Every failure becomes an ApiError with a code the UI can act on:
//   NETWORK (fetch failed) · API_UNREACHABLE (proxy got no answer) · UNAUTHENTICATED (401) · FORBIDDEN (403)
//   NOT_FOUND (404) · conflicts such as EMAIL_TAKEN (409) · VALIDATION_FAILED + fields (422) · RATE_LIMITED (429)

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export type Query = Record<string, string | number | undefined | null>;

export function apiUrl(path: string, query?: Query) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  const qs = params.toString();
  return `/api/v1${path}${qs ? `?${qs}` : ""}`;
}

// ---------- flash: a toast queued for the next page load (shown by FeedbackProvider) ----------
export const FLASH_KEY = "mcl_flash";
export function flash(tone: "success" | "error" | "warning" | "info", title: string, detail?: string) {
  try {
    sessionStorage.setItem(FLASH_KEY, JSON.stringify({ tone, title, detail }));
  } catch {
    // storage unavailable: the redirect still happens, just without the message
  }
}

/** Session gone: back to the login screen with an explanation. A full reload drops all client state. */
function sessionExpired() {
  if (window.location.pathname === "/login") return;
  // A message already queued means a move to /login is under way (signing out): a late 401 must not replace it.
  try {
    if (sessionStorage.getItem(FLASH_KEY)) return;
  } catch {
    // storage unavailable: carry on
  }
  flash("warning", "Your session has expired", "Please sign in again to continue.");
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full reload drops all client state once the session is gone
  window.location.assign("/login");
}

async function send(url: string, init?: RequestInit) {
  try {
    return await fetch(url, init);
  } catch {
    throw new ApiError(0, "NETWORK", "You appear to be offline, or the server can't be reached. Check your connection and try again.");
  }
}

async function toError(res: Response) {
  const e = await res.json().catch(() => null);
  // A 5xx without the API's JSON error body means the /api proxy could not reach MCL-CRM-Backend at all.
  if (!e && res.status >= 500) return new ApiError(res.status, "API_UNREACHABLE", "Cannot reach the MCL server. Make sure the backend API is running, then try again.");
  return new ApiError(res.status, e?.error?.code ?? "ERROR", e?.error?.message ?? "Something went wrong. Please try again.", e?.error?.fields);
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; query?: Query } = {}): Promise<T> {
  const res = await send(apiUrl(path, init.query), {
    method: init.method ?? "GET",
    headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (res.status === 401 && !path.startsWith("/auth/")) sessionExpired();
  if (!res.ok) throw await toError(res);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/**
 * POST multipart/form-data with upload progress (fetch cannot report it); failures are the same ApiErrors as api().
 * A network failure mid-request may still have been saved by the server: callers send an idempotency id so that
 * simply retrying is safe.
 */
export function upload<T>(path: string, body: FormData, onProgress?: (percent: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", apiUrl(path));
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.min(100, Math.round((e.loaded / e.total) * 100)));
    xhr.onerror = () => reject(new ApiError(0, "NETWORK", "The connection dropped during the upload. Check your connection and press Done again; nothing is saved twice."));
    xhr.onload = async () => {
      const res = new Response(xhr.status === 204 ? null : xhr.responseText, { status: xhr.status, headers: { "Content-Type": xhr.getResponseHeader("Content-Type") ?? "" } });
      if (res.status === 401) sessionExpired();
      if (!res.ok) return reject(await toError(res));
      resolve((res.status === 204 ? undefined : await res.json()) as T);
    };
    xhr.send(body);
  });
}

/**
 * Downloads a file the API streams (a lead attachment, a report) under `fileName`, or the name the API gives it;
 * resolves to that name. Failures are ApiErrors.
 */
export async function download(path: string, fileName?: string, query?: Query) {
  const res = await send(apiUrl(path, query));
  if (res.status === 401) sessionExpired();
  if (!res.ok) throw await toError(res);
  const name = fileName ?? /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "download";
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return name;
}

// Background list loads report failures to the toast system (registered by FeedbackProvider).
let onLoadError: ((err: ApiError) => void) | null = null;
export const setLoadErrorHandler = (fn: ((err: ApiError) => void) | null) => {
  onLoadError = fn;
};

// Reference lists (lead sources, stages, user pickers) change rarely: with `keep`, the last copy this tab loaded shows
// at once while a fresh one loads, so a form's dropdowns are filled on opening. Records are never kept this way, and
// a sign-out reloads the page, which empties it.
const kept = new Map<string, unknown>();

/**
 * GET with loading state. `reload()` refetches; so does a change of `refresh`. `mutate()` updates the cached
 * data in place from a save's response, so lists change instantly without another round trip. Pass null to skip.
 * A request that is no longer wanted (the query changed, the page was left) is cancelled, not left to finish.
 * `error` is the current attempt's: "Try again" (reload) clears it while the new attempt runs.
 */
export function useApi<T>(path: string | null, query?: Query, refresh = 0, { keep = false } = {}) {
  const url = path && apiUrl(path, query);
  const [state, setState] = useState<{ url: string | null; data: T | null; error: ApiError | null; attempt: string | null }>({ url: null, data: null, error: null, attempt: null });
  const [local, setTick] = useState(0);
  const tick = local + refresh;
  const attempt = `${url}#${tick}`;

  useEffect(() => {
    if (!url) return;
    const request = new AbortController();
    const key = `${url}#${tick}`;
    send(url, { signal: request.signal })
      .then(async (res) => {
        if (res.status === 401) return sessionExpired();
        if (!res.ok) throw await toError(res);
        const body = (await res.json()) as T;
        if (keep) kept.set(url, body);
        if (!request.signal.aborted) setState({ url, data: body, error: null, attempt: key });
      })
      .catch((error: ApiError) => {
        if (request.signal.aborted) return;
        setState((s) => ({ ...s, url, error, attempt: key }));
        onLoadError?.(error);
      });
    return () => request.abort();
  }, [url, tick, keep]);

  const mutate = useCallback((fn: (data: T) => T) => setState((s) => (s.data ? { ...s, data: fn(s.data) } : s)), []);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  // Keep showing the previous data while a new query loads (no flicker on search/paging).
  const data = state.data ?? (keep && url ? ((kept.get(url) as T | undefined) ?? null) : null);
  return { data, error: state.attempt === attempt ? state.error : null, loading: state.url !== url, reload, mutate };
}

/** `value`, once it has stopped changing for `ms`: search boxes query the API when typing pauses, not per key. */
export function useDebounced<T>(value: T, ms = 300) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

export type List<T> = { items: T[]; page: number; pageSize: number; total: number };

/**
 * The page to go to when the current page came back empty although it isn't page 1 (its last row was just removed,
 * here or elsewhere): the new last page. Null otherwise, and while the list held is another page's (loading).
 */
export const pastEnd = (list: List<unknown> | null, page: number) =>
  list && !list.items.length && page > 1 && list.page === page ? Math.max(1, Math.ceil(list.total / list.pageSize)) : null;

/** Props for <Pagination> from a list response: "Showing 1 to 20 of 54 Leads". */
export function paging<T>(list: List<T> | null, noun: string, onPage: (page: number) => void) {
  const total = list?.total ?? 0;
  const start = list && total ? (list.page - 1) * list.pageSize + 1 : 0;
  const end = list ? Math.min(total, start + list.items.length - (start ? 1 : 0)) : 0;
  return {
    label: list ? `Showing ${start} to ${end} of ${total.toLocaleString("en-IN")} ${noun}` : "", // no "0 of 0" while loading
    page: list?.page ?? 1,
    pages: Math.max(1, Math.ceil(total / (list?.pageSize || 20))),
    onPage,
  };
}

// ---------- display helpers ----------
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const inr = (n: number | null | undefined) => (n == null ? "------" : `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);
export const day = (iso: string | null | undefined) => (iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("en-IN") : "------");
export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" });
/** Field-level messages from a 422/409, keyed by the API's field path ("email", "contact.email"…). */
export const fieldErrors = (e: unknown): Record<string, string> => (e instanceof ApiError && e.fields ? e.fields : {});
