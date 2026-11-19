import * as XLSX from "xlsx";
import { HARDSHIP_OPTIONS, SEVERITY_HELP } from "../data/seed.js";

// Canonical bulk-intake columns. These names are what the system ingests —
// the Excel template, the field guide and the parser all share this contract.
export const TEMPLATE_HEADERS = [
  "reference",
  "policyholder_name",
  "policyholder_email",
  "policy_id",
  "location",
  "peril",
  "severity",
  "incident_date",
  "hardship_flags",
  "description",
];

const EXAMPLE_ROWS = [
  [
    "CLM-2026-001",
    "Priya Raman",
    "priya.raman@example.com",
    "POL-77341-A",
    "9 Sagar Nagar Visakhapatnam",
    "Storm surge / flooding",
    "critical",
    "2026-11-01",
    "Elderly resident, Medical needs",
    "Water through the ground floor at high tide; family moved upstairs.",
  ],
  [
    "",
    "",
    "",
    "",
    "14 Akkayyapalem Visakhapatnam",
    "Wind damage",
    "high",
    "",
    "",
    "Roof partially lifted, rear rooms exposed to weather.",
  ],
];

const FIELD_GUIDE = [
  ["Column", "Required", "Format / allowed values", "Notes"],
  ["reference", "No", "Unique text, e.g. CLM-2026-001", "Leave blank to let the system generate a claim reference. Duplicates are rejected."],
  ["policyholder_name", "No", "Free text", "Full name of the claimant as shown on the policy."],
  ["policyholder_email", "No", "name@example.com", "Used to match the claim to a policyholder portal account."],
  ["policy_id", "No", "POL-12345 style reference", "If blank the claim is recorded as POL-BATCH."],
  ["location", "Yes", "Free text", "Street address or a clear description of the damaged property."],
  ["peril", "Yes", "Free text, e.g. Wind damage", "Type of damage. Use the same wording across rows so claims cluster well."],
  ["severity", "Yes", "critical | high | medium | low", SEVERITY_HELP.critical],
  ["incident_date", "No", "YYYY-MM-DD (or an Excel date cell)", "Leave blank to use today's date."],
  ["hardship_flags", "No", `Comma-separated, from: ${HARDSHIP_OPTIONS.join("; ")}`, " Helps prioritise vulnerable households. Unrecognised values are rejected."],
  ["description", "No", "Free text", "What happened and which parts of the property are affected."],
];

const HEADER_ALIASES = {
  reference: ["reference", "ref", "claim reference", "claimreference", "claim ref"],
  policyholder_name: ["policyholder name", "name", "contact name", "contactname", "claimant name"],
  policyholder_email: ["policyholder email", "email", "contact email", "contactemail", "email address"],
  policy_id: ["policy id", "policyid", "policy number", "policynumber", "policy reference"],
  location: ["location", "address", "property address"],
  peril: ["peril", "type of damage", "damage type", "cause of damage"],
  severity: ["severity"],
  incident_date: ["incident date", "date of incident", "date", "loss date"],
  hardship_flags: ["hardship flags", "hardship", "vulnerability flags", "vulnerability"],
  description: ["description", "details", "what happened"],
};

const flagMap = new Map(HARDSHIP_OPTIONS.map((o) => [o.trim().toLowerCase(), o]));

function normKey(s) {
  return String(s ?? "").trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");
}

function normDate(v) {
  if (v === "" || v == null) return "";
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20000 && v < 80000) {
    // Excel serial date
    return new Date(Math.round((v - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d) ? s : d.toISOString().slice(0, 10);
}

// rawRows: array of arrays (first row = headers). Returns { rows, errors }.
// Each row: { rowNum, reference, contactName, contactEmail, policyId, location,
// peril, severity, incidentDate, hardshipFlags, description }
export function normalizeRows(rawRows) {
  const errors = [];
  const rowsIn = rawRows.filter((r) => Array.isArray(r) && r.some((c) => String(c ?? "").trim() !== ""));
  if (!rowsIn.length) return { rows: [], errors: [{ row: 1, message: "The sheet is empty — nothing to import." }] };

  const headerRow = rowsIn[0];
  const colMap = new Map(); // canonical field -> column index
  TEMPLATE_HEADERS.forEach((field) => {
    const idx = headerRow.findIndex((h, i) => HEADER_ALIASES[field]?.includes(normKey(h)) && !colMap.has(field));
    if (idx !== -1) colMap.set(field, idx);
  });
  const missing = TEMPLATE_HEADERS.filter((f) => !["reference", "policyholder_name", "policyholder_email", "policy_id", "incident_date", "hardship_flags", "description"].includes(f) && !colMap.has(f));
  if (missing.length) {
    return { rows: [], errors: [{ row: 1, message: `Missing required column(s): ${missing.join(", ")}. Download the template for the exact format.` }] };
  }

  const rows = rowsIn.slice(1).map((cells, i) => {
    const rowNum = i + 2; // Excel row number (1 = header)
    const get = (f) => {
      const idx = colMap.get(f);
      return idx === undefined ? "" : String(cells[idx] ?? "").trim();
    };
    const flagsRaw = get("hardship_flags");
    const flags = [];
    const unknownFlags = [];
    flagsRaw.split(/[;,]/).map((s) => s.trim()).filter(Boolean).forEach((f) => {
      const known = flagMap.get(f.toLowerCase());
      if (known) { if (!flags.includes(known)) flags.push(known); }
      else unknownFlags.push(f);
    });
    if (unknownFlags.length) {
      errors.push({ row: rowNum, message: `Unknown hardship flag(s): ${unknownFlags.join(", ")}. Valid: ${HARDSHIP_OPTIONS.join(", ")}.` });
    }
    return {
      rowNum,
      reference: get("reference"),
      contactName: get("policyholder_name") || null,
      contactEmail: get("policyholder_email") || null,
      policyId: get("policy_id") || "POL-BATCH",
      location: get("location"),
      peril: get("peril"),
      severity: get("severity").toLowerCase(),
      incidentDate: normDate(get("incident_date")),
      hardshipFlags: flags,
      description: get("description"),
    };
  }).filter((r) => Object.entries(r).some(([k, v]) => k !== "rowNum" && String(v ?? "").trim() !== ""));

  return { rows, errors };
}

// Parse any supported input (xlsx/xls/csv string or ArrayBuffer) into raw rows.
export function parseWorkbookData(data, isString = false) {
  const wb = XLSX.read(data, { type: isString ? "string" : "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
}

export function downloadTemplate() {
  const claims = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...EXAMPLE_ROWS]);
  claims["!cols"] = [{ wch: 14 }, { wch: 20 }, { wch: 26 }, { wch: 14 }, { wch: 34 }, { wch: 24 }, { wch: 10 }, { wch: 13 }, { wch: 32 }, { wch: 56 }];
  claims["!freeze"] = { xSplit: 0, ySplit: 1 };
  const guide = XLSX.utils.aoa_to_sheet(FIELD_GUIDE);
  guide["!cols"] = [{ wch: 20 }, { wch: 10 }, { wch: 52 }, { wch: 64 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, claims, "Claims");
  XLSX.utils.book_append_sheet(wb, guide, "Field guide");
  XLSX.writeFile(wb, "CAT-Claims-Bulk-Intake-Template.xlsx");
}
