import type { Request } from 'express';
import type { Role } from '@prisma/client';

export interface CurrentUserInfo {
  id: string;
  email: string;
  name: string;
  role: Role;
  sessionId: string;
}

export type AuthedRequest = Request & { user?: CurrentUserInfo };

export const SESSION_COOKIE = 'oy_sid';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 saat (bir iş günü)
