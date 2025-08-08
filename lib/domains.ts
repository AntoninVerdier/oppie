import fs from 'fs';
import path from 'path';
import { loadDomainScoresKV, saveDomainScoresKV } from '@/lib/storage';
import { getDomainsForItemNumber } from '@/lib/items';

export interface Domain {
  name: string;
  color: string;
  files: string[];
}

export interface DomainMapping {
  domains: Record<string, Domain>;
}

export interface DomainScore {
  domain: string;
  sessionId: string;
  filename: string;
  score: number;
  totalQuestions: number;
  answeredQuestions: number;
  timestamp: string;
  averageScore: number;
}

export interface DomainScores {
  scores: DomainScore[];
  lastUpdated: string | null;
}

// Load domain mapping
export function loadDomainMapping(): DomainMapping {
  try {
    const mappingPath = path.join(process.cwd(), 'data', 'domain-mapping.json');
    const mappingData = fs.readFileSync(mappingPath, 'utf8');
    return JSON.parse(mappingData);
  } catch (error) {
    console.error('Error loading domain mapping:', error);
    return { domains: {} };
  }
}

export function ensureDomainsExist(domainKeys: string[]): void {
  // On Vercel (read-only FS), skip writing and rely on pre-generated mapping
  if (process.env.VERCEL || process.env.KV_REST_API_URL) return;
  try {
    const mappingPath = path.join(process.cwd(), 'data', 'domain-mapping.json');
    const raw = fs.readFileSync(mappingPath, 'utf8');
    const mapping: DomainMapping = JSON.parse(raw);
    let changed = false;
    for (const key of domainKeys) {
      if (!mapping.domains[key]) {
        // Create a readable name from key
        const name = key
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (m) => m.toUpperCase());
        // Deterministic color pick (simple hash -> hue)
        const hash = [...key].reduce((a, c) => a + c.charCodeAt(0), 0);
        const hue = hash % 360;
        const color = `hsl(${hue} 70% 50%)`;
        mapping.domains[key] = { name, color, files: [] } as any;
        changed = true;
      }
    }
    if (changed) {
      fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2));
    }
  } catch (e) {
    // Best-effort; if file missing we skip silently in local
  }
}

// Get domains for a specific filename
export function getDomainsForFile(filename: string): string[] {
  // First, try to infer item number from filename prefix `NNN_...`
  const match = filename.match(/^(\d{1,3})_/);
  if (match) {
    const item = parseInt(match[1], 10);
    const fromCsv = getDomainsForItemNumber(item);
    if (fromCsv && fromCsv.length > 0) return fromCsv;
  }

  // Fallback to static mapping file
  const mapping = loadDomainMapping();
  const results: string[] = [];
  for (const [domainKey, domain] of Object.entries(mapping.domains)) {
    if (domain.files.includes(filename)) results.push(domainKey);
  }
  return results;
}

// Get domain info
export function getDomainInfo(domainKey: string): Domain | null {
  const mapping = loadDomainMapping();
  return mapping.domains[domainKey] || null;
}

// Load domain scores
export function loadDomainScores(): DomainScores {
  try {
    const scoresPath = path.join(process.cwd(), 'data', 'domain-scores.json');
    const scoresData = fs.readFileSync(scoresPath, 'utf8');
    return JSON.parse(scoresData);
  } catch (error) {
    // In production on Vercel, filesystem is read-only; caller should prefer async KV versions
    return { scores: [], lastUpdated: null };
  }
}

export async function loadDomainScoresAsync(): Promise<DomainScores> {
  return loadDomainScoresKV();
}

// Save domain scores
export function saveDomainScores(scores: DomainScores): void {
  try {
    const scoresPath = path.join(process.cwd(), 'data', 'domain-scores.json');
    scores.lastUpdated = new Date().toISOString();
    fs.writeFileSync(scoresPath, JSON.stringify(scores, null, 2));
  } catch {}
}

export async function saveDomainScoresAsync(scores: DomainScores): Promise<void> {
  await saveDomainScoresKV(scores);
}

// Add a new domain score
export function addDomainScore(score: Omit<DomainScore, 'timestamp'>): void {
  const scores = loadDomainScores();
  const newScore: DomainScore = { ...score, timestamp: new Date().toISOString() };
  scores.scores.push(newScore);
  saveDomainScores(scores);
}

export async function addDomainScoreAsync(score: Omit<DomainScore, 'timestamp'>): Promise<void> {
  const scores = await loadDomainScoresAsync();
  const newScore: DomainScore = { ...score, timestamp: new Date().toISOString() };
  scores.scores.push(newScore);
  await saveDomainScoresAsync(scores);
}

// Get domain evolution data
export function getDomainEvolution(domainKey: string): {
  scores: number[];
  dates: string[];
  averageScore: number;
  totalSessions: number;
} {
  const scores = loadDomainScores();
  const domainScores = scores.scores
    .filter(score => score.domain === domainKey)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
  const scoreValues = domainScores.map(s => s.averageScore);
  const dates = domainScores.map(s => s.timestamp);
  
  const averageScore = scoreValues.length > 0 
    ? scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length 
    : 0;
  
  return {
    scores: scoreValues,
    dates,
    averageScore,
    totalSessions: domainScores.length
  };
}

export async function getDomainEvolutionAsync(domainKey: string): Promise<{
  scores: number[];
  dates: string[];
  averageScore: number;
  totalSessions: number;
}> {
  const scores = await loadDomainScoresAsync();
  const domainScores = scores.scores
    .filter(score => score.domain === domainKey)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const scoreValues = domainScores.map(s => s.averageScore);
  const dates = domainScores.map(s => s.timestamp);

  const averageScore = scoreValues.length > 0
    ? scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length
    : 0;

  return { scores: scoreValues, dates, averageScore, totalSessions: domainScores.length };
}

// Get all domains with their stats
export function getAllDomainStats(): Array<{
  key: string;
  name: string;
  color: string;
  averageScore: number;
  totalSessions: number;
  lastSession: string | null;
}> {
  const mapping = loadDomainMapping();
  const stats = [];
  
  for (const [domainKey, domain] of Object.entries(mapping.domains)) {
    const evolution = getDomainEvolution(domainKey);
    const lastSession = evolution.dates.length > 0 ? evolution.dates[evolution.dates.length - 1] : null;
    
    stats.push({
      key: domainKey,
      name: domain.name,
      color: domain.color,
      averageScore: evolution.averageScore,
      totalSessions: evolution.totalSessions,
      lastSession
    });
  }
  
  return stats.sort((a, b) => b.totalSessions - a.totalSessions);
}

export async function getAllDomainStatsAsync(): Promise<Array<{
  key: string;
  name: string;
  color: string;
  averageScore: number;
  totalSessions: number;
  lastSession: string | null;
}>> {
  const mapping = loadDomainMapping();
  const stats: any[] = [];
  for (const [domainKey, domain] of Object.entries(mapping.domains)) {
    const evolution = await getDomainEvolutionAsync(domainKey);
    const lastSession = evolution.dates.length > 0 ? evolution.dates[evolution.dates.length - 1] : null;
    stats.push({
      key: domainKey,
      name: domain.name,
      color: domain.color,
      averageScore: evolution.averageScore,
      totalSessions: evolution.totalSessions,
      lastSession,
    });
  }
  return stats.sort((a, b) => b.totalSessions - a.totalSessions);
}
