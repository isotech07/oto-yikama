export type Role = 'ADMIN' | 'CASHIER' | 'WORKER';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      res.status === 429
        ? 'Çok fazla deneme yaptınız. Lütfen bir dakika sonra tekrar deneyin.'
        : typeof body.message === 'string'
          ? body.message
          : 'Beklenmeyen bir hata oluştu';
    throw new ApiError(res.status, msg);
  }
  return body as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ user: User }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  me: () => request<{ user: User }>('/auth/me'),
};

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Yönetici',
  CASHIER: 'Kasiyer',
  WORKER: 'Personel',
};
