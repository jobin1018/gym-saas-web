import { Workbook } from "exceljs";
import { mapRowsToMembers, type ParsedMemberRow } from "./csv";

// exceljs over SheetJS/xlsx: the npm-registry xlsx package (0.18.5) has two
// open, unpatched CVEs — prototype pollution (GHSA-4r6h-8v6p-xvw6) and a
// ReDoS (GHSA-5pgg-2g8v-p4x9) — both directly reachable by parsing a
// crafted file, exactly the untrusted-upload path this module exists for.
// SheetJS stopped publishing fixes to npm; their own patched builds only
// live on their CDN, which needs a non-registry install this environment
// couldn't grant permission for. exceljs has no equivalent open CVE on this
// same attack surface and installs as an ordinary dependency.

function cellToString(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) {
    // exceljs hands back a real Date for a formatted date cell (not an
    // Excel serial number) — normalize to the same YYYY-MM-DD shape the
    // CSV path already expects for start_date, rather than whatever
    // locale-formatted string Date#toString() would otherwise produce.
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "object") {
    // Rich text / hyperlink / formula cells come through as objects, not
    // plain strings — .text covers rich text & hyperlinks, .result covers
    // a formula's last computed value.
    const obj = value as { text?: unknown; result?: unknown };
    if (typeof obj.text === "string") return obj.text.trim();
    if (obj.result != null) return String(obj.result).trim();
    return "";
  }
  return String(value).trim();
}

// The only Excel-specific step: turn the first worksheet into the exact
// same string[][] shape parseCsv() already produces for CSV text. Once in
// that shape, mapRowsToMembers() (csv.ts) does all real validation —
// no separate Excel validation path to keep in sync.
async function excelToRows(buffer: ArrayBuffer): Promise<string[][]> {
  const workbook = new Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const rows: string[][] = [];
  worksheet.eachRow((row) => {
    // row.values is 1-indexed in exceljs (index 0 is always empty) —
    // dropping it here keeps column indices lined up with the header
    // lookups in mapRowsToMembers, same as parseCsv's 0-indexed output.
    const values = row.values as unknown[];
    rows.push(values.slice(1).map(cellToString));
  });
  return rows;
}

export async function parseMembersExcel(
  buffer: ArrayBuffer,
  validPlanNames: Set<string>,
): Promise<ParsedMemberRow[]> {
  return mapRowsToMembers(await excelToRows(buffer), validPlanNames);
}
