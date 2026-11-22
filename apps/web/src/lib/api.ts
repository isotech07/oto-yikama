export type Role = 'ADMIN' | 'CASHIER' | 'WORKER';
export type WorkOrderStatus = 'BEKLIYOR' | 'YIKANIYOR' | 'KURULANIYOR' | 'HAZIR' | 'TESLIM_EDILDI' | 'CANCELLED';
export type PaymentMethod = 'NAKIT' | 'KART' | 'HAVALE';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}
export interface ManagedUser extends User {
  isActive: boolean;
  createdAt: string;
}
export interface Service {
  id: string;
  name: string;
  priceKurus: number;
  vatRateBp: number;
  isActive: boolean;
}
export interface VehicleSummary {
  id: string;
  plate: string;
  brand: string | null;
  model: string | null;
  color: string | null;
}
export interface CustomerSummary {
  id: string;
  name: string;
  phone: string | null;
}
export interface Vehicle extends VehicleSummary {
  customer: CustomerSummary | null;
}
export interface CustomerListItem extends CustomerSummary {
  createdAt: string;
  vehicles: VehicleSummary[];
}
export interface CustomerPackage {
  id: string;
  name: string;
  serviceId: string;
  totalCredits: number;
  remainingCredits: number;
  priceKurus: number;
  expiresAt: string | null;
  createdAt: string;
}
export interface CustomerDetail extends CustomerListItem {
  smsConsent: boolean;
  creditAllowed: boolean;
  creditLimitKurus: number | null;
  outstandingKurus: number;
  packages: CustomerPackage[];
  workOrders: { id: string; status: WorkOrderStatus; createdAt: string; vehicle: { plate: string } }[];
}
export interface PackageDef {
  id: string;
  name: string;
  credits: number;
  priceKurus: number;
  vatRateBp: number;
  validDays: number | null;
  isActive: boolean;
  service: { id: string; name: string };
}
export interface Settings {
  name: string;
  address: string | null;
  phone: string | null;
  taxOffice: string | null;
  taxNumber: string | null;
  receiptFooter: string | null;
  smsEnabled: boolean;
  smsReadyTemplate: string;
}
export interface CashClosing {
  id: string;
  businessDate: string;
  openingFloatKurus: number;
  cashInKurus: number;
  expectedKurus: number;
  countedKurus: number;
  differenceKurus: number;
  note: string | null;
  createdAt: string;
  closedBy: { id: string; name: string };
}
export interface WorkOrderItem {
  id: string;
  serviceId: string;
  serviceName: string;
  unitPrice: number;
  vatRateBp: number;
  quantity: number;
  lineTotal: number;
  customerPackageId: string | null;
}
export interface Payment {
  id: string;
  amountKurus: number;
  method: PaymentMethod;
  note: string | null;
  createdAt: string;
  receivedBy: { id: string; name: string };
}
export interface WorkOrder {
  id: string;
  status: WorkOrderStatus;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  deliveredAt: string | null;
  cancelledAt: string | null;
  vehicle: VehicleSummary;
  customer: (CustomerSummary & { creditAllowed?: boolean; creditLimitKurus?: number | null }) | null;
  assignedWorker: { id: string; name: string } | null;
  createdBy: { id: string; name: string };
  items: WorkOrderItem[];
  totals: { grossKurus: number; vatKurus: number; netKurus: number };
  paidKurus: number | null;
  balanceKurus: number | null;
  payments?: Payment[];
  notifications?: { kind: string; status: 'PENDING' | 'SENT' | 'FAILED'; attempts: number; sentAt: string | null; lastError: string | null }[];
  allowedNext: WorkOrderStatus[];
}
export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface Summary {
  from: string;
  to: string;
  payments: { totalKurus: number; byMethod: Record<PaymentMethod, number>; refundKurus: number; refundCount: number };
  workOrders: { created: number; delivered: number; cancelled: number; openNow: number };
  revenue: { grossKurus: number; vatKurus: number; netKurus: number };
  services: { name: string; quantity: number; grossKurus: number; vatKurus: number }[];
  packages: { sold: number; grossKurus: number; vatKurus: number };
  receivablesKurus: number;
  cashClosings: { closedDays: number; totalDifferenceKurus: number };
  workers: { id: string; name: string; delivered: number }[];
}

export interface ItemInput {
  serviceId: string;
  quantity: number;
  customerPackageId?: string | null;
}

export class ApiError extends Error {
  readonly status: number;
  readonly body: Record<string, unknown>;
  constructor(status: number, message: string, body: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/** Oturum düştüğünde (401) uygulama giriş ekranına döner. */
export const SESSION_EXPIRED_EVENT = 'oy:session-expired';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    const fieldMsg = Array.isArray(body.errors) && body.errors[0]?.message;
    const msg =
      res.status === 429
        ? 'Çok fazla istek. Lütfen biraz sonra tekrar deneyin.'
        : fieldMsg || (typeof body.message === 'string' ? body.message : 'Beklenmeyen bir hata oluştu');
    throw new ApiError(res.status, msg, body);
  }
  return body as T;
}

const get = <T>(p: string) => request<T>(p);
const send = <T>(method: string, p: string, body?: unknown) =>
  request<T>(p, { method, body: body === undefined ? undefined : JSON.stringify(body) });

function qs(params: Record<string, string | number | undefined | null>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : '';
}

export const api = {
  login: (email: string, password: string) => send<{ user: User }>('POST', '/auth/login', { email, password }),
  logout: () => send<void>('POST', '/auth/logout'),
  me: () => get<{ user: User }>('/auth/me'),

  customers: {
    list: (q?: string, page = 1) => get<Paged<CustomerListItem>>(`/customers${qs({ q, page })}`),
    get: (id: string) => get<CustomerDetail>(`/customers/${id}`),
    create: (b: { name: string; phone?: string | null; smsConsent?: boolean }) => send<CustomerSummary>('POST', '/customers', b),
    update: (
      id: string,
      b: { name?: string; phone?: string | null; smsConsent?: boolean; creditAllowed?: boolean; creditLimitKurus?: number | null },
    ) => send<CustomerDetail>('PATCH', `/customers/${id}`, b),
    packages: (id: string) => get<CustomerPackage[]>(`/customers/${id}/packages`),
    sellPackage: (id: string, b: { packageId: string; method: PaymentMethod; idempotencyKey: string }) =>
      send<CustomerPackage>('POST', `/customers/${id}/packages`, b),
    remove: (id: string) => send<void>('DELETE', `/customers/${id}`),
  },
  vehicles: {
    lookup: (plate: string) =>
      get<{ plate: string; vehicle: Vehicle | null; openWorkOrder: { id: string; status: WorkOrderStatus } | null }>(
        `/vehicles/lookup${qs({ plate })}`,
      ),
    create: (b: { plate: string; customerId?: string | null; brand?: string; model?: string; color?: string }) =>
      send<Vehicle>('POST', '/vehicles', b),
    update: (id: string, b: Partial<{ plate: string; customerId: string | null; brand: string; model: string; color: string }>) =>
      send<Vehicle>('PATCH', `/vehicles/${id}`, b),
    remove: (id: string) => send<void>('DELETE', `/vehicles/${id}`),
  },
  services: {
    list: (includeInactive = false) => get<Service[]>(`/services${qs({ includeInactive: includeInactive ? 'true' : undefined })}`),
    create: (b: Omit<Service, 'id'>) => send<Service>('POST', '/services', b),
    update: (id: string, b: Partial<Omit<Service, 'id'>>) => send<Service>('PATCH', `/services/${id}`, b),
    remove: (id: string) => send<void>('DELETE', `/services/${id}`),
  },
  users: {
    list: () => get<ManagedUser[]>('/users'),
    workers: () => get<{ id: string; name: string }[]>('/users/workers'),
    create: (b: { email: string; name: string; role: Role; password: string }) => send<ManagedUser>('POST', '/users', b),
    update: (id: string, b: Partial<{ name: string; role: Role; isActive: boolean; password: string }>) =>
      send<ManagedUser>('PATCH', `/users/${id}`, b),
    remove: (id: string) => send<void>('DELETE', `/users/${id}`),
  },
  workOrders: {
    list: (p: { scope?: 'open' | 'all' | 'unpaid'; status?: WorkOrderStatus; date?: string; plate?: string; page?: number; pageSize?: number } = {}) =>
      get<Paged<WorkOrder>>(`/work-orders${qs(p)}`),
    get: (id: string) => get<WorkOrder>(`/work-orders/${id}`),
    create: (b: {
      plate: string;
      customerId?: string | null;
      assignedWorkerId?: string | null;
      note?: string | null;
      items: ItemInput[];
    }) => send<WorkOrder>('POST', '/work-orders', b),
    status: (id: string, to: WorkOrderStatus) => send<WorkOrder>('POST', `/work-orders/${id}/status`, { to }),
    assign: (id: string, workerId: string | null) => send<WorkOrder>('PATCH', `/work-orders/${id}/assign`, { workerId }),
    note: (id: string, note: string | null) => send<WorkOrder>('PATCH', `/work-orders/${id}/note`, { note }),
    addItems: (id: string, items: ItemInput[]) =>
      send<WorkOrder>('POST', `/work-orders/${id}/items`, { items }),
    removeItem: (id: string, itemId: string) => send<WorkOrder>('DELETE', `/work-orders/${id}/items/${itemId}`),
    pay: (id: string, b: { amountKurus: number; method: PaymentMethod; note?: string | null; idempotencyKey: string }) =>
      send<WorkOrder>('POST', `/work-orders/${id}/payments`, b),
  },
  packages: {
    list: (includeInactive = false) => get<PackageDef[]>(`/packages${qs({ includeInactive: includeInactive ? 'true' : undefined })}`),
    create: (b: { name: string; serviceId: string; credits: number; priceKurus: number; vatRateBp: number; validDays: number | null; isActive: boolean }) =>
      send<PackageDef>('POST', '/packages', b),
    update: (id: string, b: Partial<{ name: string; priceKurus: number; vatRateBp: number; validDays: number | null; isActive: boolean }>) =>
      send<PackageDef>('PATCH', `/packages/${id}`, b),
    remove: (id: string) => send<void>('DELETE', `/packages/${id}`),
  },
  settings: {
    get: () => get<Settings>('/settings'),
    update: (b: Partial<Settings>) => send<Settings>('PATCH', '/settings', b),
  },
  cash: {
    preview: (date?: string) => get<{ date: string; cashInKurus: number; closing: CashClosing | null }>(`/cash-closings/preview${qs({ date })}`),
    close: (b: { date: string; openingFloatKurus: number; countedKurus: number; note?: string | null }) =>
      send<CashClosing>('POST', '/cash-closings', b),
    list: () => get<CashClosing[]>('/cash-closings'),
  },
  reports: {
    summary: (from: string, to: string) => get<Summary>(`/reports/summary${qs({ from, to })}`),
  },
};
