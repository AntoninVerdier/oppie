/*
  Rebuilds data/domain-mapping.json from Item_de_connaissance_2C_LiSA_table.csv
  Usage: node scripts/generate-domain-mapping.js
*/
const fs = require('fs');
const path = require('path');

// We no longer map/merge colleges; we mint domains directly from college labels

function slugify(input) {
  let s = String(input || '')
    .replace(/\(.*?\)/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!s) s = 'autre';
  return s;
}

function csvSplit(line) {
  const result = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && i + 1 < line.length && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQ = !inQ; }
    } else if (ch === ',' && !inQ) {
      result.push(cur); cur = '';
    } else { cur += ch; }
  }
  result.push(cur);
  return result.map((s) => s.trim());
}

function normalizeDomainsFromCollege(college) {
  const out = new Set();
  const parts = String(college || '')
    .split(/•|\||;|,|\/|\+/)
    .map((s) => s.trim())
    .filter((s) => s && s.toLowerCase() !== 'nan');
  for (const p of parts) out.add(slugify(p));
  return Array.from(out);
}

function titleToFilename(num, title) {
  const clean = String(title || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${num}_${clean}.pdf`;
}

function colorForKey(key) {
  const hash = Array.from(key).reduce((a, c) => a + c.charCodeAt(0), 0);
  const hue = hash % 360;
  return `hsl(${hue} 70% 50%)`;
}

function main() {
  const root = process.cwd();
  const csvPath = path.join(root, 'Item_de_connaissance_2C_LiSA_table.csv');
  const outPath = path.join(root, 'data', 'domain-mapping.json');
  const itemMapPath = path.join(root, 'data', 'item-domain-map.json');
  if (!fs.existsSync(csvPath)) {
    console.error('CSV not found:', csvPath);
    process.exit(1);
  }
  const raw = fs.readFileSync(csvPath, 'utf8');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const domains = {};
  const itemDomainMap = {}; // item number -> array of domain keys

  for (let i = 1; i < lines.length; i++) {
    const cols = csvSplit(lines[i]);
    if (cols.length < 3) continue;
    const num = parseInt(cols[0], 10);
    const title = cols[1] || '';
    const primary = cols[2] || '';
    const secondary = cols[3] || '';
    if (!Number.isFinite(num)) continue;
    const fileName = titleToFilename(num, title);
    const ds = new Set([
      ...normalizeDomainsFromCollege(primary),
      ...normalizeDomainsFromCollege(secondary),
    ]);
    const doms = Array.from(ds);
    itemDomainMap[num] = doms;
    for (const d of doms) {
      if (!domains[d]) {
        const name = d.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
        domains[d] = { name, color: colorForKey(d), files: [] };
      }
      domains[d].files.push(fileName);
    }
  }

  // Sort files and domains for consistency
  for (const key of Object.keys(domains)) {
    domains[key].files = Array.from(new Set(domains[key].files)).sort();
  }
  const sorted = Object.fromEntries(Object.keys(domains).sort().map((k) => [k, domains[k]]));
  const payload = { domains: sorted };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  fs.writeFileSync(itemMapPath, JSON.stringify(itemDomainMap, null, 2));
  console.log('Wrote', outPath, 'with', Object.keys(sorted).length, 'domains');
  console.log('Wrote', itemMapPath, 'with', Object.keys(itemDomainMap).length, 'items');
}

main();


