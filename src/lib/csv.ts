// Small hand-rolled parser instead of pulling in papaparse: the expected
// input is a simple 4-column staff-exported sheet (name, phone, plan_name,
// start_date), not arbitrary user-supplied CSV with exotic edge cases. This
// still handles the one thing a naive `line.split(',')` gets wrong — quoted
// fields containing commas — so a plan name like "Monthly, Unlimited" (if it
// ever existed) wouldn't silently misalign columns.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && next === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

import { normalizePhone } from "./phone";

export type ParsedMemberRow = {
  line: number;
  name: string;
  phone: string;
  plan_name: string;
  start_date: string;
  errors: string[];
};

// The format-agnostic half of the pipeline: once ANY source (CSV text,
// an .xlsx worksheet) has been turned into the same plain string[][] shape
// (one array per row, header row first), validation/error-reporting is
// identical regardless of where those rows came from. parseMembersCsv and
// excel.ts's parseMembersExcel both funnel into this one function rather
// than each re-implementing the same header lookup + validation rules.
export function mapRowsToMembers(
  rows: string[][],
  validPlanNames: Set<string>,
): ParsedMemberRow[] {
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const nameIdx = header.indexOf("name");
  const phoneIdx = header.indexOf("phone");
  const planIdx = header.indexOf("plan_name");
  const startIdx = header.indexOf("start_date");

  const dataRows = rows.slice(1);

  return dataRows.map((cells, i) => {
    const name = (cells[nameIdx] ?? "").trim();
    const rawPhone = (cells[phoneIdx] ?? "").trim();
    const normalizedPhone = normalizePhone(rawPhone);
    const plan_name = (cells[planIdx] ?? "").trim();
    const start_date =
      (cells[startIdx] ?? "").trim() || new Date().toISOString().slice(0, 10);

    const errors: string[] = [];
    if (!name) errors.push("Missing name");
    if (!normalizedPhone) errors.push("Invalid phone number");
    if (!plan_name) errors.push("Missing plan name");
    else if (!validPlanNames.has(plan_name))
      errors.push(`Unrecognized plan "${plan_name}"`);

    return {
      line: i + 2,
      name,
      phone: normalizedPhone ?? rawPhone,
      plan_name,
      start_date,
      errors,
    };
  });
}

export function parseMembersCsv(
  text: string,
  validPlanNames: Set<string>,
): ParsedMemberRow[] {
  return mapRowsToMembers(parseCsv(text), validPlanNames);
}
