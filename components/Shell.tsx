"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, use, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useDismissConfirm, useToast } from "@/components/feedback";
import { api, ApiError, flash, useApi } from "@/lib/api";
import { can, landing, MODULES_PAGE, moduleOf, modulesFor, pageOf, SHARED } from "@/lib/modules";
import { setTheme, useTheme } from "@/lib/theme";
import { Icon, type IconName } from "./Icon";
import { Loading, Skeleton } from "./skeletons";
import { LoadFailed, noteNavigation, useEscape } from "./ui";
import { LiveNotifications, NotificationBell } from "./notifications";

// A sidebar entry: one of the module's pages (lib/modules.ts), a shared page, or Logout. Pages a role can't open are
// not listed (the API refuses them regardless).
type NavItem = { label: string; icon: IconName; href?: string; onClick?: () => void };

// The workspace a shared page (Notifications) shows: the module the user was last in, in this tab.
const LAST_MODULE = "mcl_module";
function lastModule() {
  try {
    return sessionStorage.getItem(LAST_MODULE);
  } catch {
    return null; // storage blocked: the first module the role has
  }
}

export type Me = { id: string; name: string; email: string; initials: string; role: { id: string; name: string }; permissions: string[] };
const MeCtx = createContext<Me | null>(null);
/** The signed-in user (null while loading). */
export const useMe = () => use(MeCtx);

/** Header sun / moon: switches the whole app between light and dark (remembered, and followed by other tabs). */
function ThemeToggle() {
  const dark = useTheme() === "dark";
  return (
    <button
      suppressHydrationWarning
      type="button"
      aria-label="Dark mode"
      aria-pressed={dark}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(dark ? "light" : "dark")}
      className="flex size-9 cursor-pointer items-center justify-center rounded-full text-nav transition-colors hover:bg-[rgb(71_215_251/0.2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <Icon name={dark ? "moon" : "sun"} size={22} className="transition-transform duration-300 motion-safe:hover:rotate-12" />
    </button>
  );
}

// Full-screen routes rendered without the sidebar + header
const AUTH_ROUTES = ["/login", "/forgot-password"];

// Figma "Tab select": Default / Variant2 (hover, Smart Animate 300ms ease-out) / Variant3 (active); 40px rows
function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const cls = `flex h-10 w-full shrink-0 items-center gap-3 rounded-[12px] border px-3 text-left text-[14px] font-medium whitespace-nowrap transition-[background-color,border-color,color] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
    active
      ? "border-stroke bg-[linear-gradient(89.46deg,#243dba_0%,#6a9bef_99.91%)] text-white"
      : "border-transparent bg-primary text-nav hover:border-stroke2 hover:bg-[rgb(71_215_251/0.3)]"
  }`;
  const body = (
    <>
      <Icon name={item.icon} size={20} />
      {item.label}
    </>
  );
  return item.href ? (
    <Link href={item.href} className={cls} aria-current={active ? "page" : undefined}>
      {body}
    </Link>
  ) : (
    <button suppressHydrationWarning type="button" onClick={item.onClick} className={`${cls} cursor-pointer`}>
      {body}
    </button>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // The phone / tablet menu is a drawer over the page; Escape closes it, and so does widening the window to the
  // desktop layout (sidebar always shown).
  useEscape(open, () => setOpen(false));
  useEffect(() => {
    const desktop = matchMedia("(min-width: 1024px)");
    const close = () => desktop.matches && setOpen(false);
    desktop.addEventListener("change", close);
    return () => desktop.removeEventListener("change", close);
  }, []);
  const isAuthRoute = AUTH_ROUTES.includes(pathname);
  // Permissions are re-read on every page change (keeping the last answer meanwhile), so a role edit reaches an
  // open tab on its next navigation instead of only after a reload.
  const [visit, setVisit] = useState({ path: pathname, n: 0 });
  if (visit.path !== pathname) setVisit({ path: pathname, n: visit.n + 1 });
  // …and when the user comes back to the tab, so a role change (say, gaining Notifications) shows without a reload.
  useEffect(() => {
    const onShow = () => document.visibilityState === "visible" && setVisit((v) => ({ ...v, n: v.n + 1 }));
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, []);
  // The sidebar and the main area scroll on their own (the window itself never scrolls), so the browser's Back /
  // Forward scroll restoration doesn't reach the page: keep each address's position and put it back when the history
  // returns there. A new navigation starts at the top (Next scrolls the new page into view). The router shows the
  // page of a Back / Forward before the browser's popstate event in this Next version (and after it in others), so
  // the position goes back in whichever of the two comes second: the page shown, or the history move.
  const main = useRef<HTMLElement>(null);
  const positions = useRef(new Map<string, number>());
  const shown = useRef<{ path: string; saved?: number }>({ path: pathname });
  const traversedTo = useRef<string | null>(null); // a Back / Forward's address, until its page is shown
  const restore = useCallback(() => {
    const el = main.current;
    if (!el || traversedTo.current !== shown.current.path) return;
    el.scrollTop = shown.current.saved ?? 0;
    traversedTo.current = null;
  }, []);
  useEffect(() => {
    const traverse = () => {
      traversedTo.current = location.pathname;
      restore();
      setOpen(false); // Back / Forward with the menu drawer open: the page shown comes without it
    };
    window.addEventListener("popstate", traverse);
    return () => window.removeEventListener("popstate", traverse);
  }, [restore]);
  useLayoutEffect(() => {
    const el = main.current;
    if (!el) return;
    // Read before any scroll event of the page switch can overwrite it
    shown.current = { path: pathname, saved: positions.current.get(pathname) };
    restore();
    const save = () => positions.current.set(pathname, el.scrollTop);
    el.addEventListener("scroll", save, { passive: true });
    return () => el.removeEventListener("scroll", save);
  }, [pathname, restore]);
  // A confirmation asked by the page that was left closes ("no"): it must not act on that page from the next one.
  // That page's own dropdowns and dialogs close when it shows again, except a dialog holding unsaved input
  // (noteNavigation, components/ui.tsx).
  const dismissConfirm = useDismissConfirm();
  useEffect(() => {
    dismissConfirm();
    noteNavigation();
  }, [pathname, dismissConfirm]);
  // The keyboard (Space, Page Down, arrows) scrolls what holds the focus, and the window no longer scrolls: the page
  // shown takes the focus from the document or the menu link used to reach it, but not from a field or dialog of its own.
  useEffect(() => {
    const at = document.activeElement;
    const kept = at instanceof HTMLElement && at.checkVisibility() && (main.current?.contains(at) || at.closest("[role=dialog]"));
    if (!kept) main.current?.focus({ preventScroll: true });
  }, [pathname]);
  // The module of the page shown, kept for this tab: Notifications (no module of its own) keeps that sidebar.
  useEffect(() => {
    const m = moduleOf(pathname);
    try {
      if (m) sessionStorage.setItem(LAST_MODULE, m.key);
    } catch {
      // storage blocked: shared pages show the first module
    }
  }, [pathname]);
  const account = useApi<{ user: Me }>(isAuthRoute ? null : "/auth/me", undefined, visit.n);
  const me = account.data?.user ?? null;
  const toast = useToast();
  const [signingOut, setSigningOut] = useState(false);

  // Only leave once the server has ended the session; the cookie is HttpOnly, so the browser alone can't.
  const logout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      // 401: the session had already ended (expired, password changed, account deactivated): signed out all the same.
      await api("/auth/logout", { method: "POST" }).catch((err) => {
        if (!(err instanceof ApiError && err.status === 401)) throw err;
      });
      flash("success", "You've been signed out");
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full reload drops all client state once the session is gone
      window.location.assign("/login");
    } catch (err) {
      setSigningOut(false);
      toast.apiError(err, "Couldn't sign you out");
    }
  };

  if (isAuthRoute) return children;

  // Nothing is listed until the user's permissions are known, so forbidden items never flash in.
  const perms = me?.permissions ?? [];
  const isActive = (href?: string) => !!href && (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  // A page the role lacks shows a notice instead of an empty, half-working screen.
  const page = pageOf(pathname);
  const denied = !!me && !!page && !can(perms, page);
  const home = me ? landing(perms) : null;
  // The Modules page is the landing screen: no module sidebar there. Every other page shows its module's sidebar
  // (a shared page: the module the user came from) with only the pages the role may open.
  const bare = pathname === MODULES_PAGE.href;
  const mine = modulesFor(perms);
  const here = moduleOf(pathname);
  const workspace = (here && mine.find((m) => m.key === here.key)) || mine.find((m) => m.key === lastModule()) || mine[0];
  const bottomItems: NavItem[] = me
    ? [...SHARED.filter((p) => can(perms, p)), ...(can(perms, MODULES_PAGE) ? [MODULES_PAGE] : []), { label: signingOut ? "Signing out…" : "Logout", icon: "logout", onClick: logout }]
    : [];

  return (
    <MeCtx value={me}>
      <LiveNotifications userId={me?.permissions.includes("notifications") ? me.id : null} check={visit.n}>
        <aside
          hidden={bare}
          className={`fixed top-0 left-0 z-40 flex h-dvh w-60 flex-col border-r border-stroke bg-primary transition-transform lg:translate-x-0 ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {/* As tall as the header, so the two borders line up */}
          <div className="flex h-16 w-full shrink-0 items-center gap-2 border-b border-stroke px-5">
            <Image src="/img/logo.png" alt="MCL" width={82} height={72} priority className="h-10 w-[46px] object-contain" />
            <div className="flex flex-col leading-none text-selected">
              <p className="text-[20px] font-bold tracking-[-0.4px]">MCL</p>
              <p className="text-[11px] font-medium tracking-[-0.2px] opacity-50">CRM PLATFORM</p>
            </div>
          </div>
          {/* The links scroll on their own when they don't fit (the logo stays put), never moving the page beside them */}
          <nav aria-label={workspace ? `${workspace.name} pages` : "Pages"} className="flex min-h-0 w-full flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-3 py-4" onClick={() => setOpen(false)}>
            {/* Until the permissions are known: placeholder rows where the links will be (an empty list showed only
                the bottom group's divider, at the top, which then jumped down when the links arrived) */}
            {!me && (
              <Loading label="Loading the menu…" className="flex flex-col gap-1">
                <Skeleton className="mx-3 mt-0.5 mb-[3px] h-3 w-14" />
                {Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-10 rounded-[12px]" />)}
              </Loading>
            )}
            {workspace && <p className="px-3 pb-1 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">{workspace.name}</p>}
            {workspace?.pages.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(item.href)} />
            ))}
            {/* Right under the module's pages (pinned to the bottom, it left a tall empty gap above them) */}
            {me && (
              <div className="mt-3 flex w-full flex-col gap-1 border-t border-stroke2 pt-3">
                {bottomItems.map((item) => (
                  <NavLink key={item.label} item={item} active={isActive(item.href)} />
                ))}
              </div>
            )}
          </nav>
        </aside>

        {open && !bare && (
          <div className="fixed inset-0 z-30 bg-scrim/25 lg:hidden" onClick={() => setOpen(false)} aria-hidden />
        )}

        <header className={`fixed top-0 right-0 left-0 z-20 flex h-16 items-center justify-end gap-3 border-b border-stroke bg-primary px-4 sm:gap-4 sm:px-6 ${bare ? "" : "lg:left-60"}`}>
          {bare ? (
            // No sidebar on the Modules page: the brand moves into the header.
            <Link href={MODULES_PAGE.href} className="mr-auto flex items-center gap-3 rounded-[12px] text-selected focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
              <Image src="/img/logo.png" alt="" width={82} height={72} className="h-10 w-[46px] object-contain" />
              <span className="flex flex-col leading-none">
                <span className="text-[20px] font-bold tracking-[-0.4px]">MCL</span>
                <span className="text-[11px] font-medium tracking-[-0.2px] opacity-50">CRM PLATFORM</span>
              </span>
            </Link>
          ) : (
            <button suppressHydrationWarning
              type="button"
              aria-label="Open menu"
              onClick={() => setOpen(true)}
              className="mr-auto flex size-6 cursor-pointer flex-col justify-center gap-[5px] lg:hidden"
            >
              <span className="h-[1.5px] w-full rounded bg-nav" />
              <span className="h-[1.5px] w-full rounded bg-nav" />
              <span className="h-[1.5px] w-full rounded bg-nav" />
            </button>
          )}
          <ThemeToggle />
          {/* The bell's place is kept while the account loads, so the controls beside it don't jump when it arrives */}
          {me ? me.permissions.includes("notifications") && <NotificationBell /> : <span aria-hidden className="size-9" />}
          <div className="flex items-center gap-2.5">
            <div className="relative size-9 shrink-0">
              <div className="flex size-full items-center justify-center rounded-full bg-[linear-gradient(141.61deg,#676ff6_15.93%,#cc4ec4_85.25%)] font-inter text-[13px] font-bold text-white">
                {me?.initials}
              </div>
              <Image src="/img/online-dot.svg" alt="" width={21} height={21} className="absolute -right-0.5 -bottom-0.5 size-3.5 max-w-none" />
            </div>
            <div className="hidden flex-col sm:flex">
              {me ? (
                <>
                  <p className="text-[14px] font-semibold text-nav">{me.name}</p>
                  <p className="text-[12px] font-medium text-nav opacity-60">{me.role.name}</p>
                </>
              ) : (
                // Name and role placeholders, about as wide as the text they stand for (the header held still)
                <>
                  <Skeleton className="my-px h-[15px] w-20" />
                  <Skeleton className="mt-[3px] h-3 w-12" />
                </>
              )}
            </div>
          </div>
        </header>

        {/* The page's own scroller, under the header and beside the sidebar: scrolling it moves neither of them */}
        <main ref={main} tabIndex={-1} className={`fixed inset-x-0 top-16 bottom-0 overflow-y-auto overscroll-contain outline-none ${bare ? "" : "lg:left-60"}`}>
          {!me && account.error ? (
            // Without the account nothing can be shown (not even the menu): say so, with a way to try again.
            <div className="p-4 sm:p-6">
              <LoadFailed what="account details" onRetry={account.reload} />
            </div>
          ) : denied ? (
            <div className="flex flex-col items-start gap-3 p-4 sm:p-6">
              <h1 className="text-[22px] font-semibold tracking-[-0.44px] text-black">No access</h1>
              <p className="text-[14px] text-nav">Your role does not include {page.label}. Ask an administrator if you need it.</p>
              {home && (
                <Link href={home} className="font-semibold text-link hover:underline">
                  Go to {pageOf(home.split("?")[0]!)?.label ?? "your pages"}
                </Link>
              )}
            </div>
          ) : (
            // Until the permissions are known a gated page stays hidden, so it never shows before a "No access"; it is
            // still mounted, so its data loads alongside them instead of after them (one round trip less on every load).
            <div hidden={!me && !!page} className="contents">
              {children}
            </div>
          )}
        </main>
      </LiveNotifications>
    </MeCtx>
  );
}
