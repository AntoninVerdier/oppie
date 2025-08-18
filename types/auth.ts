export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  roles: string[];
  createdAt: string;
  lastLoginAt?: string;
  stats?: {
    sessionsCount: number;
    averageScore: number; // 0..1
  };
}

export interface SessionRecord {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string; // ISO
  userAgentHash?: string;
  ipHash?: string;
}
