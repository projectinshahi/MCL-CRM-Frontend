// Modules group the app's existing pages into workspaces (owner's decision, 20 Oct 2026: the Figma cards Sales, BDE
// and Finance; Sales holds every page built so far, BDE and Finance show as coming soon until they have pages). A page
// keeps its one URL: the module is worked out from the address, so direct links, refreshes and Back/Forward always
// show the right sidebar. Access stays per page permission, checked again by the API on every request: a module is
// only a way of grouping what a role may open.
import type { IconName } from "@/components/Icon";

export type NavPage = { label: string; icon: IconName; href: string; perm: string };
/** `access`: the line under the name on its Modules card (Figma text). No pages: not built yet. */
export type Module = { key: string; name: string; icon: IconName; access: string; pages: NavPage[] };

export const MODULES: Module[] = [
  {
    key: "sales",
    name: "Sales",
    icon: "shopping-bag",
    access: "Dashboard, Leads, Follow Ups",
    pages: [
      { label: "Dashboard", icon: "element-4", href: "/", perm: "dashboard" },
      { label: "Leads", icon: "chart", href: "/leads", perm: "leads" },
      { label: "Customers", icon: "profile-2user", href: "/customers", perm: "customers" },
      { label: "Follow-Ups", icon: "followups-nav", href: "/follow-ups", perm: "follow_ups" },
      { label: "DTDC Calculator", icon: "calculator", href: "/calculator", perm: "calculator" },
      { label: "Users", icon: "profile-tick", href: "/users", perm: "users" },
      { label: "Settings", icon: "settings-nav", href: "/settings", perm: "settings" },
    ],
  },
  { key: "bde", name: "BDE", icon: "call", access: "Dashboard, Leads, Follow Ups", pages: [] },
  { key: "finance", name: "Finance", icon: "bitcoin-card", access: "Dashboard, Leads, Follow Ups", pages: [] },
];

/** Pages that belong to no one module: in every workspace's sidebar. */
export const SHARED: NavPage[] = [{ label: "Notifications", icon: "notification-bing", href: "/notifications", perm: "notifications" }];
export const MODULES_PAGE: NavPage = { label: "All modules", icon: "colorfilter", href: "/modules", perm: "modules" };

/** Does `href` (a nav page) cover `pathname`? "/" only itself; others their sub-pages too (/leads/123). */
export const covers = (href: string, pathname: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

export const can = (perms: readonly string[], page: NavPage) => perms.includes(page.perm);

/** Modules with at least one page the role may open, each with only those pages. */
export function modulesFor(perms: readonly string[]): Module[] {
  return MODULES.map((m) => ({ ...m, pages: m.pages.filter((p) => can(perms, p)) })).filter((m) => m.pages.length);
}

/** The module a page belongs to, or undefined (the Modules page, Notifications, unknown paths). */
export const moduleOf = (pathname: string) => MODULES.find((m) => m.pages.some((p) => covers(p.href, pathname)));

/** Every page the shell knows, for its "No access" check. */
export const ALL_PAGES: NavPage[] = [...MODULES.flatMap((m) => m.pages), ...SHARED, MODULES_PAGE];
export const pageOf = (pathname: string) => ALL_PAGES.find((p) => covers(p.href, pathname));

/**
 * Where a user goes after signing in: the address they first asked for when it is one of this site's pages they may
 * open (never another site), else the Modules page, else the first page their role allows.
 */
export function landing(perms: readonly string[], next?: string | null): string {
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) {
    const page = pageOf(next.split(/[?#]/)[0]!);
    if (page && can(perms, page)) return next;
  }
  if (can(perms, MODULES_PAGE)) return MODULES_PAGE.href;
  return modulesFor(perms)[0]?.pages[0]?.href ?? SHARED.find((p) => can(perms, p))?.href ?? MODULES_PAGE.href;
}
