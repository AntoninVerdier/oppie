import fs from 'fs';
import path from 'path';

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

// Get domains for a specific filename
export function getDomainsForFile(filename: string): string[] {
  const mapping = loadDomainMapping();
  const domains: string[] = [];
  
  for (const [domainKey, domain] of Object.entries(mapping.domains)) {
    if (domain.files.includes(filename)) {
      domains.push(domainKey);
    }
  }
  
  return domains;
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
    console.error('Error loading domain scores:', error);
    return { scores: [], lastUpdated: null };
  }
}

// Save domain scores
export function saveDomainScores(scores: DomainScores): void {
  try {
    const scoresPath = path.join(process.cwd(), 'data', 'domain-scores.json');
    scores.lastUpdated = new Date().toISOString();
    fs.writeFileSync(scoresPath, JSON.stringify(scores, null, 2));
  } catch (error) {
    console.error('Error saving domain scores:', error);
  }
}

// Add a new domain score
export function addDomainScore(score: Omit<DomainScore, 'timestamp'>): void {
  const scores = loadDomainScores();
  const newScore: DomainScore = {
    ...score,
    timestamp: new Date().toISOString()
  };
  
  scores.scores.push(newScore);
  saveDomainScores(scores);
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
