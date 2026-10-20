"use client";

import Link from "next/link";
import { createContext, use, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { api } from "@/lib/api";
import { Icon } from "./Icon";

/* =====================================================================================================
   The header bell's unread count, and a soft chime when a new notification arrives.
   While a user with the Notifications page is signed in, the API is asked for the unread count every 30 s, and
   also at once when the tab is shown or focused, on every page change and after the user's own changes (one
   small indexed request; one at a time; signed out, nothing runs). Any change in the answer refreshes the
   Notifications page if it is open. A new arrival (a newer notification, or more unread than before) plays the
   chime: once per browser even with several tabs open, never for notifications already there when the page
   opened, and never for reading, removing or clearing them.
   ===================================================================================================== */

const POLL_MS = 30_000;
const SOON_MS = 2_000; // a focus or page-change check this soon after the last one is skipped
type Unread = { unreadCount: number; latestAt: string | null; total: number };
type Live = { unread: number | null; version: number; setUnread: (n: number) => void; refresh: () => void };
const LiveCtx = createContext<Live>({ unread: null, version: 0, setUnread: () => {}, refresh: () => {} });
/** unread: the bell's count (null until known). version: goes up whenever the server's answer changes. refresh(): check now. */
export const useLiveNotifications = () => use(LiveCtx);

/* ---------- the chime ---------- */
// Two short sine notes made by the browser (Web Audio): no sound file to download or go missing. Browsers let a page
// start audio only during a click, tap or key press, or (Chrome, Firefox) once the page has had one. So audio is
// switched on by the first such interaction on any page, the sign-in itself included, or as soon as a check finds the
// page has had one. Until then a new notification shows silently. The context is suspended between chimes so it
// doesn't hold the audio device, and any audio failure is swallowed: notifications never depend on it.
type Ctor = typeof AudioContext;
let audio: AudioContext | null = null;
let allowed = false; // the browser has let this page start audio, so later chimes may resume it
let rest: ReturnType<typeof setTimeout> | undefined;

/** Settles once the browser has allowed audio, or refused it. A refused resume may stay pending: never wait on it. */
function unlockAudio(): Promise<void> {
  if (allowed) return Promise.resolve();
  try {
    const Ctx: Ctor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
    if (!Ctx) return Promise.resolve();
    audio ??= new Ctx();
    return audio.resume().then(
      () => {
        if (audio?.state !== "running" || allowed) return;
        allowed = true;
        rest = setTimeout(() => void audio?.suspend().catch(() => {}), 1_000);
      },
      () => {},
    );
  } catch {
    return Promise.resolve(); // no Web Audio in this browser: notifications stay silent
  }
}
if (typeof window !== "undefined")
  for (const type of ["pointerup", "touchend", "click", "keydown"]) window.addEventListener(type, unlockAudio, { capture: true, passive: true });

async function chime() {
  const ctx = audio;
  if (!ctx || !allowed) return;
  try {
    clearTimeout(rest);
    // Waking the audio device can take a moment; the limit only stops a refused resume (which never settles) from
    // keeping this waiting.
    if (ctx.state !== "running") await Promise.race([ctx.resume(), new Promise((resolve) => setTimeout(resolve, 3_000))]);
    if (ctx.state !== "running") return;
    const t = ctx.currentTime + 0.02;
    for (const [hz, at] of [[880, 0], [1318.5, 0.12]] as const) {
      const tone = ctx.createOscillator();
      const volume = ctx.createGain();
      tone.frequency.value = hz;
      volume.gain.setValueAtTime(0.0001, t + at);
      volume.gain.exponentialRampToValueAtTime(0.2, t + at + 0.02); // a fifth of full volume, fading out
      volume.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.9);
      tone.connect(volume).connect(ctx.destination);
      tone.start(t + at);
      tone.stop(t + at + 0.95);
    }
    rest = setTimeout(() => void ctx.suspend().catch(() => {}), 1_600);
  } catch {
    // never let a sound problem reach the notifications
  }
}

/* ---------- on / off, per user, kept in this browser (the same after a reload or signing in again) ---------- */
const SOUND_CHANGED = "mcl:notification-sound";
const soundKey = (userId: string) => `mcl_notification_sound:${userId}`;
const unsaved = new Map<string, boolean>(); // storage blocked: remembered for this page only

function soundOn(userId: string) {
  try {
    return localStorage.getItem(soundKey(userId)) !== "off";
  } catch {
    return unsaved.get(userId) ?? true;
  }
}

/** Switches the chime on or off; switching it on plays it once (a click, so allowed), so the user hears their choice. */
export function setSoundOn(userId: string, on: boolean) {
  try {
    localStorage.setItem(soundKey(userId), on ? "on" : "off");
  } catch {
    unsaved.set(userId, on);
  }
  window.dispatchEvent(new Event(SOUND_CHANGED));
  if (on) void unlockAudio().then(chime);
}

function subscribeSound(onChange: () => void) {
  window.addEventListener(SOUND_CHANGED, onChange);
  window.addEventListener("storage", onChange); // switched in another tab
  return () => {
    window.removeEventListener(SOUND_CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Whether the chime is on for this user (on unless they switched it off). */
export const useSoundOn = (userId: string | undefined) => useSyncExternalStore(subscribeSound, () => !userId || soundOn(userId), () => true);

/**
 * True for the first tab to announce an arrival (identified by the newest unread time and the unread count); the
 * user's other tabs stay quiet for it. Only a tab that can play calls this, so a silent tab never silences the others.
 */
function claimChime(userId: string, { latestAt, unreadCount }: Unread) {
  const at = latestAt ?? "";
  try {
    const key = `mcl_notification_chimed:${userId}`;
    let last: { at: string; count: number } | null = null;
    try {
      last = JSON.parse(localStorage.getItem(key) ?? "null");
    } catch {
      // an older or unreadable value: treated as none
    }
    if (last && typeof last === "object" && (last.at > at || (last.at === at && last.count >= unreadCount))) return false;
    localStorage.setItem(key, JSON.stringify({ at, count: unreadCount }));
  } catch {
    // storage blocked: this tab decides alone
  }
  return true;
}

function announce(userId: string, now: Unread) {
  if (!soundOn(userId) || !allowed || !claimChime(userId, now)) return;
  void chime();
}

/* ---------- the poll ---------- */
/**
 * Keeps the bell current for `userId`; null (signed out, or no Notifications page) runs nothing. `check` changes on
 * every page change (Shell), which checks at once.
 */
export function LiveNotifications({ userId, check, children }: { userId: string | null; check: number; children: ReactNode }) {
  const [unread, setUnread] = useState<number | null>(null);
  const [version, setVersion] = useState(0);
  const pollNow = useRef<(urgent?: boolean) => void>(() => {});

  useEffect(() => {
    if (!userId) return;
    let stopped = false;
    let running = false;
    let again = false; // an urgent check asked for while one was running: run another when it ends
    let startedAt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last: Unread | undefined; // this tab's previous answer; undefined before the first
    const poll = async (urgent = false) => {
      if (running) {
        again ||= urgent;
        return;
      }
      if (!urgent && Date.now() - startedAt < SOON_MS) return;
      running = true;
      startedAt = Date.now();
      clearTimeout(timer);
      try {
        if (!allowed && navigator.userActivation?.hasBeenActive) void unlockAudio(); // e.g. signed in, then waited
        const now = await api<Unread>("/notifications/unread");
        if (stopped) return;
        setUnread(now.unreadCount);
        if (last && (now.unreadCount !== last.unreadCount || now.latestAt !== last.latestAt || now.total !== last.total)) {
          setVersion((v) => v + 1);
          // Unread rows only appear by arriving, so a newer one, or more than before (one saved just after a newer
          // one), is an arrival. The first answer is never one: those were there when the page opened.
          const newer = !!now.latestAt && (!last.latestAt || now.latestAt > last.latestAt);
          if (newer || now.unreadCount > last.unreadCount) announce(userId, now);
        }
        last = now;
      } catch {
        // offline, rate-limited or a hiccup: the badge keeps its last count and the next check tries again
      } finally {
        running = false;
      }
      if (stopped) return;
      if (again) {
        again = false;
        void poll(true);
      } else timer = setTimeout(() => void poll(), POLL_MS);
    };
    pollNow.current = (urgent) => void poll(urgent);
    const onShow = () => document.visibilityState === "visible" && void poll();
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onShow);
    void poll(true);
    return () => {
      stopped = true;
      clearTimeout(timer);
      pollNow.current = () => {};
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", onShow);
    };
  }, [userId]);

  // A page change checks too (skipped if a check has only just run, e.g. the first one).
  useEffect(() => pollNow.current(), [check]);

  const value = useMemo(() => ({ unread, version, setUnread, refresh: () => pollNow.current(true) }), [unread, version]);
  return <LiveCtx value={value}>{children}</LiveCtx>;
}

/** The header bell, with its unread count. */
export function NotificationBell() {
  const { unread } = useLiveNotifications();
  return (
    <Link href="/notifications" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} className="relative text-nav">
      <Icon name="notification-bing" />
      {!!unread && (
        <span aria-hidden className="absolute -top-[7px] -right-[9px] flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-[5px] text-[11px] leading-none font-semibold text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
