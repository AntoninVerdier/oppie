import fs from "fs";
import path from "path";

// Cache to avoid re-reading CSV repeatedly
let cachedMap: Map<number, string[]> | null = null;
let cachedMtime: number | null = null;

function slugify(input: string): string {
  let s = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!s) s = "autre";
  return s;
}

function normalizeDomainsFromCollege(college: string): string[] {
  const out = new Set<string>();
  const parts = String(college || "")
    .split(/•|\||;|,|\/|\+/)
    .map((s) => s.trim())
    .filter((s) => s && s.toLowerCase() !== "nan");
  for (const p of parts) {
    out.add(slugify(p));
  }
  return Array.from(out);
}

// Basic CSV line splitter respecting quotes
function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      // Double quote inside quoted field
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result.map((s) => s.trim());
}

export function loadItemDomainMap(): Map<number, string[]> {
  // Preferred: load from hard JSON
  try {
    const jsonPath = path.join(process.cwd(), 'data', 'item-domain-map.json');
    const raw = fs.readFileSync(jsonPath, 'utf8');
    const obj = JSON.parse(raw) as Record<string, string[]>;
    const map = new Map<number, string[]>();
    for (const [k, v] of Object.entries(obj)) {
      const num = parseInt(k, 10);
      if (Number.isFinite(num)) map.set(num, v);
    }
    cachedMap = map;
    cachedMtime = null;
    return map;
  } catch {}

  // Fallback: read CSV if JSON missing
  try {
    const csvPath = path.join(process.cwd(), 'Item_de_connaissance_2C_LiSA_table.csv');
    const stat = fs.statSync(csvPath);
    if (cachedMap && cachedMtime === stat.mtimeMs) {
      return cachedMap;
    }
    const raw = fs.readFileSync(csvPath, 'utf8');
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const map = new Map<number, string[]>();
    for (let i = 1; i < lines.length; i++) {
      const cols = splitCsvLine(lines[i]);
      if (cols.length < 3) continue;
      const num = parseInt(cols[0], 10);
      if (!Number.isFinite(num)) continue;
      const primary = cols[2] || '';
      const secondary = cols[3] || '';
      const domains = new Set<string>();
      for (const d of normalizeDomainsFromCollege(primary)) domains.add(d);
      for (const d of normalizeDomainsFromCollege(secondary)) domains.add(d);
      if (domains.size > 0) map.set(num, Array.from(domains));
    }
    cachedMap = map;
    cachedMtime = stat.mtimeMs;
    return map;
  } catch {
    return new Map();
  }
}

export function getDomainsForItemNumber(itemNumber: number): string[] | null {
  const map = loadItemDomainMap();
  return map.get(itemNumber) || null;
}


