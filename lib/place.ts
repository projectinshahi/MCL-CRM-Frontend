// Where a dropdown menu goes, from its trigger's box (viewport coordinates): joined to the trigger's bottom edge, the
// two 1px borders overlapping into one line (OVERLAP); above it instead when it doesn't fit below and there is more
// room above; always inside the screen (MARGIN from each edge). `start` lines the menu's left edge up with the
// trigger's, `end` its right edge (buttons at the right of a toolbar or row). Too tall for either side: it keeps the
// larger side and gets a height to scroll within.
// `join` says which corners to square so trigger and menu read as one control: the trigger's corners on the menu's
// side that the menu spans under (or over), and the menu's corners that meet one of the trigger's (an aligned edge).
// A menu pushed off its trigger's edge by the screen edge keeps that corner rounded.

export const OVERLAP = 1;
export const MARGIN = 8;
const MIN_HEIGHT = 120; // a list is never squeezed below this; it would rather overlap the edge margin

type Box = { top: number; bottom: number; left: number; right: number };
type Size = { width: number; height: number };
export type Corner = "tl" | "tr" | "bl" | "br";

const near = (a: number, b: number) => Math.abs(a - b) < 0.5; // sub-pixel boxes from getBoundingClientRect

export function place(trigger: Box, menu: Size, view: Size, align: "start" | "end" = "start") {
  const below = view.height - trigger.bottom + OVERLAP - MARGIN;
  const above = trigger.top + OVERLAP - MARGIN;
  const up = menu.height > below && above > below;
  const room = Math.max(up ? above : below, MIN_HEIGHT);
  const height = Math.min(menu.height, room);
  const x = align === "end" ? trigger.right - menu.width : trigger.left;
  const left = Math.max(MARGIN, Math.min(x, view.width - menu.width - MARGIN));
  const right = left + menu.width;
  // The trigger's side facing the menu, and the menu's side facing the trigger.
  const [t, m] = up ? ["t", "b"] : ["b", "t"];
  const join = { trigger: [] as Corner[], menu: [] as Corner[] };
  if (left <= trigger.left + 0.5) join.trigger.push(`${t}l` as Corner);
  if (right >= trigger.right - 0.5) join.trigger.push(`${t}r` as Corner);
  if (near(left, trigger.left)) join.menu.push(`${m}l` as Corner);
  if (near(right, trigger.right)) join.menu.push(`${m}r` as Corner);
  return {
    top: up ? trigger.top + OVERLAP - height : trigger.bottom - OVERLAP,
    left,
    maxHeight: menu.height > room ? room : undefined,
    up,
    join,
  };
}
