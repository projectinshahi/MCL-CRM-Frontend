"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useConfirm, useToast } from "@/components/feedback";
import { setSoundOn, useLiveNotifications, useSoundOn } from "@/components/notifications";
import { useMe } from "@/components/Shell";
import { Skeleton, SkeletonCards, SubtitleSkeleton } from "@/components/skeletons";
import { IconButton, LoadFailed, Pagination } from "@/components/ui";
import { SectionHeader } from "@/components/users/SectionHeader";
import { api, ApiError, dateTime, paging, useApi, type List } from "@/lib/api";

type Notification = { id: string; title: string; detail: string | null; link: string | null; read: boolean; createdAt: string };
type Feed = List<Notification> & { unreadCount: number };
const PAGE_SIZE = 20;
/** Already removed (say, in another tab): what the user wanted is done. */
const gone = (err: unknown) => err instanceof ApiError && err.status === 404;

const toolButton =
  "flex shrink-0 cursor-pointer items-center gap-2 rounded-[18px] border border-stroke2 bg-bg5 px-[17px] py-[13px] text-[16px] leading-5 font-medium whitespace-nowrap text-nav focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-default disabled:opacity-50";

function SpeakerIcon({ on }: { on: boolean }) {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      {on ? <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /> : <path d="m16 9 5 6m0-6-5 6" />}
    </svg>
  );
}

// Figma 1:6702. Unread = green dot, read = faded blue dot. Opening one (its title) marks that one read, nothing else;
// each can also be marked read or removed, and Clear all removes the whole list after a confirmation. Changes show at
// once and are put back, with an error message, if the server refuses them; the list is then re-read from the server.
// It also refreshes whenever the bell's check finds something changed (a new notification, or one read elsewhere).
export default function NotificationsPage() {
  const me = useMe();
  const live = useLiveNotifications();
  const toast = useToast();
  const confirm = useConfirm();
  const soundOn = useSoundOn(me?.id);
  const [page, setPage] = useState(1);
  const list = useApi<Feed>("/notifications", { page, pageSize: PAGE_SIZE }, live.version);
  const feed = list.data;
  // Next keeps a left page alive (hidden) and shows it again as it was: coming back, always start at the newest.
  useLayoutEffect(() => () => setPage(1), []);
  const [busy, setBusy] = useState<string[]>([]); // "read:<id>" / "remove:<id>" while that request runs
  const [clearing, setClearing] = useState(false);

  // The bell follows this list's count when it changes: the server's latest, plus every change made here. (Not again
  // when the page is shown with its old list, which would put an old count back on the bell.)
  const { setUnread, refresh } = live;
  const unreadCount = feed?.unreadCount;
  const pushed = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (unreadCount === undefined || unreadCount === pushed.current) return;
    pushed.current = unreadCount;
    setUnread(unreadCount);
  }, [unreadCount, setUnread]);
  // The newest notification this page has shown: Clear all removes up to it, never one that arrived unseen.
  const newestSeen = useRef<string | undefined>(undefined);
  const top = feed?.items[0]?.createdAt;
  useEffect(() => {
    if (top && (!newestSeen.current || top > newestSeen.current)) newestSeen.current = top;
  }, [top]);

  /** Shows `apply` at once, sends `request`, and puts it back with `undo` (and says so) if the server refuses it. */
  async function change(key: string, request: () => Promise<unknown>, apply: (f: Feed) => Feed, undo: (f: Feed) => Feed, failTitle: string) {
    if (busy.includes(key)) return false;
    setBusy((b) => [...b, key]);
    list.mutate(apply);
    try {
      await request();
      refresh(); // the bell checks at once; its changed answer re-reads this list from the server
      return true;
    } catch (err) {
      if (gone(err)) return true;
      list.mutate(undo);
      toast.apiError(err, failTitle);
      list.reload(); // a refresh may have landed meanwhile: the server's list, not a doubly undone one
      return false;
    } finally {
      setBusy((b) => b.filter((k) => k !== key));
    }
  }

  const setRead = (id: string, read: boolean, by: number) => (f: Feed) => ({
    ...f,
    unreadCount: Math.max(0, f.unreadCount + by),
    items: f.items.map((i) => (i.id === id ? { ...i, read } : i)),
  });
  const markRead = (n: Notification) =>
    !n.read && change(`read:${n.id}`, () => api(`/notifications/${n.id}/read`, { method: "POST" }), setRead(n.id, true, -1), setRead(n.id, false, 1), "Couldn't mark it as read");

  const remove = async (n: Notification) => {
    const unread = n.read ? 0 : 1;
    const lastOnPage = feed?.items.length === 1 && feed.total > 1;
    const removed = await change(
      `remove:${n.id}`,
      () => api(`/notifications/${n.id}`, { method: "DELETE" }),
      (f) => ({ ...f, total: f.total - 1, unreadCount: f.unreadCount - unread, items: f.items.filter((i) => i.id !== n.id) }),
      (f) => ({ ...f, total: f.total + 1, unreadCount: f.unreadCount + unread, items: [...f.items, n].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }),
      "Couldn't remove the notification",
    );
    if (!removed) return;
    // That emptied this page: step back one. Otherwise the next one moves up when the list is re-read: change()
    // asked the bell to check, and the total it reports changed (re-reading here too fetched the list twice).
    if (lastOnPage && page > 1) setPage(page - 1);
  };

  const clearAll = async () => {
    if (clearing || !feed?.total) return;
    const ok = await confirm({
      title: "Clear all notifications?",
      message: "Every notification will be removed from your list. This can't be undone.",
      confirmLabel: "Clear all",
      danger: true,
    });
    if (!ok) return;
    setClearing(true);
    const shown = feed;
    list.mutate((f) => ({ ...f, items: [], total: 0, unreadCount: 0 }));
    try {
      await api("/notifications", { method: "DELETE", query: { before: newestSeen.current } });
      setPage(1);
      refresh();
      toast.success("Notifications cleared");
    } catch (err) {
      list.mutate(() => shown);
      toast.apiError(err, "Couldn't clear your notifications");
    } finally {
      setClearing(false);
    }
  };

  // On phones the two buttons take their own row under the title (the page's padding is 1rem each side).
  const actions = (
    <div className="flex flex-wrap items-center gap-2 max-sm:w-[calc(100vw-2rem)]">
      <button
        suppressHydrationWarning
        type="button"
        role="switch"
        aria-checked={soundOn}
        title={soundOn ? "Mute the sound for new notifications" : "Play a sound for new notifications"}
        onClick={() => me && setSoundOn(me.id, !soundOn)}
        className={toolButton}
      >
        <SpeakerIcon on={soundOn} />
        Sound
      </button>
      <button suppressHydrationWarning type="button" onClick={clearAll} disabled={clearing || !feed?.total} className={toolButton}>
        {clearing ? "Clearing…" : "Clear all"}
      </button>
    </div>
  );

  return (
    <div className="flex flex-col gap-[18px] p-4 sm:p-6">
      <SectionHeader title="Notifications" subtitle={feed ? `${feed.unreadCount} Unread Notifications` : !list.error && <SubtitleSkeleton />} action={actions} />
      {!feed && !list.error && (
        <SkeletonCards className="flex flex-col gap-[10px] rounded-[24px] border border-stroke2 bg-primary p-5">
          <div className="flex items-center gap-2">
            <Skeleton className="size-[10px] shrink-0 rounded-full" />
            <Skeleton className="h-5 w-1/2" />
          </div>
          <Skeleton className="ml-5 h-4 w-36" />
        </SkeletonCards>
      )}
      {!feed && list.error && <LoadFailed what="notifications" onRetry={list.reload} />}
      {feed?.total === 0 && <p className="text-[16px] text-nav opacity-70">No notifications yet.</p>}
      {feed?.items.map((n) => (
        <article key={n.id} className="flex flex-col gap-[10px] rounded-[24px] border border-stroke2 bg-primary p-5">
          {/* dot pinned to the first line (= centred on Figma's single 22px line) when the title wraps */}
          <div className="flex items-start gap-2">
            <span className={`mt-[6px] size-[10px] shrink-0 rounded-full ${n.read ? "bg-[rgb(106_155_239/0.25)]" : "bg-[#00d14c]"}`} />
            <p className="min-w-0 flex-1 text-[18px] font-medium tracking-[-0.72px] break-words text-black">
              {n.link ? (
                <Link href={n.link} onClick={() => markRead(n)} className="hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                  {n.title}
                </Link>
              ) : (
                n.title
              )}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              {!n.read && <IconButton icon="mark" label="Mark as read" onClick={() => markRead(n)} />}
              <IconButton icon="delete" label="Remove notification" onClick={() => remove(n)} />
            </div>
          </div>
          {n.detail && <p className="pl-5 text-[16px] tracking-[-0.64px] text-nav opacity-70">{n.detail}</p>}
          <p className="pl-5 text-[14px] tracking-[-0.56px] text-nav opacity-70">{dateTime(n.createdAt)}</p>
        </article>
      ))}
      {!!feed && feed.total > PAGE_SIZE && <Pagination {...paging(feed, "Notifications", setPage)} />}
    </div>
  );
}
