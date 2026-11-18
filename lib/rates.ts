// Courier rate management and the calculator, as MCL-CRM-Backend's /couriers, /rate-cards, /rate-imports and
// /calculator endpoints send them. Weights and prices travel as exact decimal text.
import type { Cell } from "./operations";

export type Account = { id: string; name: string; note: string | null; active: boolean; rateCards?: number };
export type Step = { upToKg: number | null; stepKg: number };
export type WeightRule = { id: string; service: string; useVolumetric: boolean; divisor: number | null; minChargeableKg: string | null; steps: Step[]; updatedAt: string };
export type Courier = { id: string; name: string; active: boolean; rateCards: number; accounts: Account[]; weightRules: WeightRule[] };

export type Scope = "domestic" | "international";
export type Contents = "any" | "document" | "non_document";
export type Charge = { label: string; type: "fixed" | "percent"; value: string };

export const SCOPES: { value: Scope; label: string }[] = [
  { value: "international", label: "International" },
  { value: "domestic", label: "Domestic (India)" },
];
export const CONTENTS: { value: Contents; label: string }[] = [
  { value: "any", label: "Documents and parcels" },
  { value: "document", label: "Documents (DOX)" },
  { value: "non_document", label: "Parcels (NDOX)" },
];
export const label = <T extends string>(list: { value: T; label: string }[], v: T) => list.find((x) => x.value === v)?.label ?? v;

export type CardDetails = {
  courierId: string;
  accountId: string | null;
  name: string;
  scope: Scope;
  service: string;
  contents: Contents;
  origin: string;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  active: boolean;
  fuelPercent: string | null;
  gstPercent: string | null;
  gstIncluded: boolean;
  charges: Charge[];
};

export type RateCard = Omit<CardDetails, "courierId" | "accountId"> & {
  id: string;
  courier: { id: string; name: string };
  account: { id: string; name: string } | null;
  prices: number;
  destinations: number;
  import: { id: string; fileName: string } | null;
  layout: { sheet: string; table: TableLayout } | null;
  createdBy: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
};
export type RateCardDetail = RateCard & {
  zones: string[];
  weights: { label: string; kind: Kind; fromKg: string; toKg: string | null; unitKg: string | null }[];
  grid: ({ price: string; cell: string } | null)[][];
};

// ---------- reading a rate workbook ----------

export type Kind = "flat" | "per_kg" | "additional";
export type Slab = { kind: Kind; fromKg: string; toKg: string | null; unitKg: string | null };
export type TableLayout = {
  sheet: number;
  orientation: "weights_down" | "weights_across";
  headerRow: number;
  labelColumn: number;
  lastColumn: number;
  firstRow: number;
  lastRow: number;
  unit: "kg" | "lb";
  readings?: Record<string, Slab>;
};
export type ZoneLayout = { sheet: number; headerRow: number; pairs: { key: number; zone: number }[] };
export type Workbook = {
  id: string;
  fileName: string;
  fileSize: number;
  createdAt: string;
  createdBy: { id: string; name: string };
  cards: { id: string; name: string }[];
  sheets: { index: number; name: string; rows: number; columns: number; tables: (TableLayout & { cells: number })[]; zoneList: ZoneLayout | null }[];
};
export type SheetWindow = { name: string; total: number; from: number; rows: Cell[][] };
export type Problem = { cell: string | null; level: "error" | "warning"; message: string };
export type ReadResult = {
  weights: { label: string; slab: Slab | null; read: "auto" | "set" | "none"; at: string }[];
  zones: { label: string; key: string; at: string }[];
  prices: number;
  empty: number;
  grid: (string | null)[][];
  zoneList: { count: number; sample: { destination: string; zone: string; cell: string }[]; zones: string[] } | null;
  problems: Problem[];
};

/** "A" for column 1, "AA" for 27: as Excel names columns. */
export function columnLetter(n: number) {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}
/** Column 1 for "A" (case and spaces ignored), or NaN. */
export function columnNumber(s: string) {
  const t = s.trim().toUpperCase();
  if (!/^[A-Z]{1,3}$/.test(t)) return NaN;
  return [...t].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
}

const LB = "0.45359237";
const kg = (s: string) => `${Number(s)} kg`;
/** A slab in words: "up to 0.5 kg", "per kg from 20 to 44 kg", "each further 0.5 kg above 2 kg". */
export function slabText(s: Slab | null | undefined): string {
  if (!s) return "can't be read";
  const per = s.unitKg === LB ? "per lb" : s.unitKg && Number(s.unitKg) !== 1 ? `per ${kg(s.unitKg)}` : "per kg";
  if (s.kind === "flat") return `up to ${kg(s.toKg ?? "0")}`;
  if (s.kind === "additional") return `each further ${kg(s.unitKg ?? "0")} above ${kg(s.fromKg)}`;
  // Per-lb prices read in pounds (stored in kg; shown only)
  const w = (v: string) => (s.unitKg === LB ? `${Math.round((Number(v) / Number(LB)) * 1e6) / 1e6} lb` : kg(v));
  if (s.toKg === null) return `${per}, ${w(s.fromKg)} and above`;
  if (s.toKg === s.fromKg) return `${per}, at ${w(s.fromKg)}`;
  return `${per}, ${w(s.fromKg)} to ${w(s.toKg)}`;
}

// ---------- the calculator ----------

export type CalcOptions = { couriers: { id: string; name: string; general: boolean; accounts: { id: string; name: string }[] }[]; origins: string[]; scopes: Scope[] };
export type Line = { label: string; rate: string | null; amount: string };
export type Quote = {
  card: { id: string; name: string; service: string; contents: Contents; scope: Scope; origin: string; currency: string; effectiveFrom: string; effectiveTo: string | null; file: string | null };
  courier: { id: string; name: string };
  account: { id: string; name: string } | null;
  zone: string;
  zoneFound: string;
  weight: { actualKg: string; volumetricKg: string | null; chargeableKg: string; notes: string[] };
  weightRule: { service: string; divisor: number | null; useVolumetric: boolean; minChargeableKg: string | null; steps: Step[] } | null;
  freight: { amount: string; basis: string; cell: string };
  lines: Line[];
  total: string;
};
export type QuoteResult = { quotes: Quote[]; unmatched: { card: string; courier: string; reason: string }[]; message: string | null };

/** ₹1,234.50 (or the card's currency code), from exact decimal text. */
export const money = (amount: string, currency = "INR") =>
  `${currency === "INR" ? "₹" : `${currency} `}${Number(amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
