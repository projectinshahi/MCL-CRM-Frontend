"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, use, useEffect, useState } from "react";
import { useToast } from "@/components/feedback";
import { api, ApiError, flash, useApi } from "@/lib/api";
import { setTheme, useTheme } from "@/lib/theme";
import { Icon, type IconName } from "./Icon";
import { LoadFailed } from "./ui";
import { LiveNotifications, NotificationBell } from "./notifications";

// perm = the API permission a page needs; the item is hidden without it (the API enforces it regardless).
type NavItem = { label: string; icon: IconName; href?: string; perm?: string; onClick?: () => void };

const MAIN_NAV: NavItem[] = [
  { label: "Dashboard", icon: "element-4", href: "/", perm: "dashboard" },
  { label: "Leads", icon: "chart", href: "/leads", perm: "leads" },
  { label: "Customers", icon: "profile-2user", href: "/customers", perm: "customers" },
  { label: "Follow - Ups", icon: "followups-nav", href: "/follow-ups", perm: "follow_ups" },
  { label: "User", icon: "profile-tick", href: "/users", perm: "users" },
  { label: "Notifications", icon: "notification-bing", href: "/notifications", perm: "notifications" },
  { label: "DTDC Calculator", icon: "calculator", href: "/calculator", perm: "calculator" },
];


const BOTTOM_NAV: NavItem[] = [
  { label: "Modules", icon: "colorfilter", href: "/modules", perm: "modules" },
  { label: "Settings", icon: "settings-nav", href: "/settings", perm: "settings" },
  { label: "Logout", icon: "logout" }, // handler attached in Shell (needs the toast system)
];

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
      className="-m-[6px] flex size-9 cursor-pointer items-center justify-center rounded-full text-nav transition-colors hover:bg-[rgb(71_215_251/0.2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <Icon name={dark ? "moon" : "sun"} className="transition-transform duration-300 motion-safe:hover:rotate-12" />
    </button>
  );
}

// Full-screen routes rendered without the sidebar + header
const AUTH_ROUTES = ["/login", "/forgot-password"];

// Figma "Tab select": Default / Variant2 (hover, Smart Animate 300ms ease-out) / Variant3 (active)
function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const cls = `flex w-full items-center gap-4 rounded-[18px] border px-[15px] py-[13px] text-left text-[18px] font-medium tracking-[-0.36px] whitespace-nowrap transition-[background-color,border-color,color] ${
    active
      ? "border-stroke bg-[linear-gradient(89.46deg,#243dba_0%,#6a9bef_99.91%)] text-white"
      : "border-transparent bg-primary text-nav hover:border-stroke2 hover:bg-[rgb(71_215_251/0.3)]"
  }`;
  const body = (
    <>
      <Icon name={item.icon} />
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
  const allowed = (item: NavItem) => !!me && (!item.perm || me.permissions.includes(item.perm));
  const isActive = (href?: string) =>
    !!href && (href === "/" ? pathname === "/" : pathname.startsWith(href));
  // A page whose nav item the role lacks shows a notice instead of an empty, half-working screen.
  const page = [...MAIN_NAV, ...BOTTOM_NAV].find((item) => isActive(item.href));
  const denied = !!me && !!page && !allowed(page);
  const home = [...MAIN_NAV, ...BOTTOM_NAV].find((item) => item.href && allowed(item));

  return (
    <MeCtx value={me}>
      <LiveNotifications userId={me?.permissions.includes("notifications") ? me.id : null} check={visit.n}>
        <aside
          className={`fixed top-0 left-0 z-40 flex h-dvh w-[300px] flex-col overflow-y-auto rounded-[8px] border-r border-stroke bg-primary transition-transform lg:translate-x-0 ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex w-full shrink-0 items-center border-b border-stroke px-7 py-5">
            <Image src="/img/logo.png" alt="MCL" width={82} height={72} priority className="h-[71.881px] w-[81.741px] object-cover" />
            <div className="flex w-[131px] flex-col text-selected">
              <p className="text-[26px] font-bold tracking-[-0.52px]">MCL</p>
              <p className="text-[14px] font-medium tracking-[-0.28px] opacity-50">CRM PLATFORM</p>
            </div>
          </div>
          <nav className="flex w-full flex-col gap-2 px-4 py-8" onClick={() => setOpen(false)}>
            {MAIN_NAV.filter(allowed).map((item) => (
              <NavLink key={item.label} item={item} active={isActive(item.href)} />
            ))}
            <div className="h-6 shrink-0" />
            <div className="flex w-full flex-col gap-2 border-t border-stroke2">
              {BOTTOM_NAV.filter(allowed).map((item) => item.label === "Logout" ? { ...item, label: signingOut ? "Signing out…" : item.label, onClick: logout } : item).map((item) => (
                <NavLink key={item.label} item={item} active={isActive(item.href)} />
              ))}
            </div>
          </nav>
        </aside>

        {open && (
          <div className="fixed inset-0 z-30 bg-scrim/25 lg:hidden" onClick={() => setOpen(false)} aria-hidden />
        )}

        <header className="fixed top-0 right-0 left-0 z-20 flex items-center justify-end gap-[26px] border-b border-stroke bg-primary px-6 pt-[14px] pb-[13px] lg:left-[300px]">
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
          <ThemeToggle />
          {me?.permissions.includes("notifications") && <NotificationBell />}
          <div className="flex items-center gap-[17px] sm:pr-5">
            <div className="relative size-[50px] shrink-0">
              <div className="flex size-full items-center justify-center rounded-full bg-[linear-gradient(141.61deg,#676ff6_15.93%,#cc4ec4_85.25%)] font-inter text-[19px] font-bold tracking-[-0.38px] text-white">
                {me?.initials}
              </div>
              <Image src="/img/online-dot.svg" alt="" width={21} height={21} className="absolute -right-[2px] -bottom-[2px] size-[21px] max-w-none" />
            </div>
            <div className="hidden flex-col sm:flex">
              <p className="text-[18px] font-semibold tracking-[-0.36px] text-nav">{me?.name}</p>
              <p className="text-[12px] font-medium tracking-[-0.24px] text-nav opacity-50">{me?.role.name}</p>
            </div>
          </div>
        </header>

        <main className="min-h-dvh pt-[77px] lg:pl-[300px]">
          {!me && account.error ? (
            // Without the account nothing can be shown (not even the menu): say so, with a way to try again.
            <div className="p-4 sm:p-6">
              <LoadFailed what="account details" onRetry={account.reload} />
            </div>
          ) : denied ? (
            <div className="flex flex-col items-start gap-3 p-4 sm:p-6">
              <h1 className="text-[26px] font-semibold tracking-[-0.64px] text-black">No access</h1>
              <p className="text-[16px] text-nav">Your role does not include {page.label}. Ask an administrator if you need it.</p>
              {home?.href && (
                <Link href={home.href} className="font-semibold text-link hover:underline">
                  Go to {home.label}
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
