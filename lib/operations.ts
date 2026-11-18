// Operations (shipments) and their Excel imports, as MCL-CRM-Backend's /operations endpoints send them.
// The columns themselves come from the API (GET /operations/fields): the client's workbook, in its order.

export type FieldType = "id" | "date" | "weight" | "text" | "category" | "place" | "customer" | "user" | "phone";
export type ShipmentField = { key: string; header: string; type: FieldType };
export type Fields = { fields: ShipmentField[]; matchKeys: string[] };

/** A workbook cell as read: text, number, true/false, a date ({ d }), an Excel error ({ e }), or empty. */
export type Cell = string | number | boolean | { d: string } | { e: string } | null;

/** A number as people write it: no float noise (0.30000000000000004 → "0.3"), no exponent for whole numbers. */
const numberText = (n: number) => (Number.isInteger(n) ? n.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 0 }) : String(Number(n.toPrecision(12))));

/** How a cell reads in Excel: a date as dd/mm/yyyy, TRUE/FALSE, an error as its code. */
export function cellText(c: Cell | undefined): string {
  if (c === null || c === undefined) return "";
  if (typeof c === "string") return c;
  if (typeof c === "number") return numberText(c);
  if (typeof c === "boolean") return c ? "TRUE" : "FALSE";
  if ("d" in c) {
    const [y, m, d] = c.d.slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
  }
  return c.e;
}

export type Shipment = {
  id: string;
  extra: Record<string, string>;
  customer: { id: string; code: string; name: string } | null;
  salesExecutiveUser: { id: string; name: string } | null;
  operatorUser: { id: string; name: string } | null;
  importId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
} & Record<string, string | number | null | undefined | object>;

export type ShipmentDetail = Shipment & {
  source: Record<string, Cell> | null;
  lastImport: { id: string; fileName: string; importedAt: string | null } | null;
  createdBy: { id: string; name: string };
  updatedBy: { id: string; name: string } | null;
};

/** A field's value for display: dates as dd/mm/yyyy, weights in kg. */
export function shownValue(f: ShipmentField, v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (f.type === "date" && typeof v === "string") return cellText({ d: v });
  return String(v);
}

export type Target = string; // a field key, "extra" or "skip"
export type Totals = {
  rows?: number;
  valid?: number;
  attention?: number;
  duplicate?: number;
  invalid?: number;
  create?: number;
  update?: number;
  unchanged?: number;
  changes?: number;
  attentionWrites?: number; // rows needing attention that would be created or updated
  newValues?: Record<string, Record<string, number>>;
  // after importing
  created?: number;
  updated?: number;
  skipped?: number;
  includeAttention?: boolean;
};
export type ImportStatus = "uploaded" | "validated" | "imported" | "cancelled";
export type ImportMode = "add" | "update";

export type ImportView = {
  id: string;
  fileName: string;
  fileSize: number;
  sheetName: string;
  sheets: { name: string; rows: number }[];
  headerRow: number;
  headers: string[];
  rowCount: number;
  status: ImportStatus;
  mode: ImportMode | null;
  matchKey: string;
  mapping: Target[];
  savedMapping: boolean;
  totals: Totals;
  preview: { rowNumber: number; cells: Cell[] }[];
  sameFile: { id: string; importedAt: string; by: string } | null;
  createdBy: { id: string; name: string };
  createdAt: string;
  importedAt: string | null;
};

export type Problem = { field: string | null; level: "error" | "duplicate" | "attention"; message: string; value?: string };
export type Change = { field: string; label: string; from: string | null; to: string | null };
export type CheckedRow = {
  rowNumber: number;
  cells: Cell[];
  problems: Problem[];
  category: "valid" | "attention" | "duplicate" | "invalid" | null;
  action: "create" | "update" | "unchanged" | "none" | null;
  changes: Change[];
  outcome: string | null;
};

export type ImportSummary = {
  id: string;
  fileName: string;
  sheetName: string;
  rowCount: number;
  status: ImportStatus;
  mode: ImportMode | null;
  totals: Totals;
  createdAt: string;
  importedAt: string | null;
  createdBy: { id: string; name: string };
};
