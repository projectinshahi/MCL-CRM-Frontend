// One colour language for statuses everywhere: the leads table, the pipeline, detail pages, follow-ups, customers and
// users. Colours come from meaning, not from where the label appears: a won stage is green and a lost one red on
// every screen; the other stages keep fixed, distinct hues (a custom stage from Settings gets one from its name, so
// it is the same colour on every screen and every day). The class names for each tone are in components/ui.tsx.
export type StatusTone = "sky" | "indigo" | "teal" | "violet" | "cyan" | "pink" | "orange" | "lime" | "green" | "red" | "amber" | "slate";

const STAGE_HUES: StatusTone[] = ["sky", "indigo", "teal", "violet", "cyan", "pink", "orange", "lime"];
// The seeded stages, and won/lost names as a fallback where a stage arrives without its flags.
const STAGE_BY_NAME: Record<string, StatusTone> = { new: "sky", contacted: "indigo", interested: "teal", proposal: "violet", converted: "green", won: "green", lost: "red" };

export function stageTone(stage: { name: string; isWon?: boolean; isLost?: boolean }): StatusTone {
  if (stage.isWon) return "green";
  if (stage.isLost) return "red";
  const name = stage.name.trim().toLowerCase();
  if (STAGE_BY_NAME[name]) return STAGE_BY_NAME[name];
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return STAGE_HUES[h % STAGE_HUES.length]!;
}

/** Priorities, payment, follow-up and account states (shown capitalised). */
export const LABEL_TONE: Record<string, StatusTone> = {
  Low: "slate",
  Medium: "amber",
  High: "red",
  Pending: "amber",
  Completed: "green",
  Overdue: "red",
  Active: "green",
  Inactive: "slate",
};
