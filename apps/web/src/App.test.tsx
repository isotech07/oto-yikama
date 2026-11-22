import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

type Handler = (url: string, init?: RequestInit) => { status: number; body?: unknown } | undefined;
let calls: { url: string; init?: RequestInit }[] = [];

function mockFetch(handler: Handler) {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const r = handler(url, init) ?? { status: 404, body: { message: 'yok' } };
      return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status });
    }),
  );
}

beforeEach(() => window.history.pushState({}, '', '/'));
afterEach(() => vi.unstubAllGlobals());

const cashier = { id: 'c1', email: 'k@x.tr', name: 'Ayşe Kasiyer', role: 'CASHIER' };
const worker = { id: 'w1', email: 'p@x.tr', name: 'Mehmet', role: 'WORKER' };
const empty = { items: [], total: 0, page: 1, pageSize: 100 };

function order(over: object = {}) {
  return {
    id: 'o1',
    status: 'YIKANIYOR',
    note: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deliveredAt: null,
    cancelledAt: null,
    vehicle: { id: 'v1', plate: '34ABC123', brand: null, model: null, color: null },
    customer: null,
    assignedWorker: { id: 'w1', name: 'Mehmet' },
    createdBy: { id: 'c1', name: 'Ayşe' },
    items: [{ id: 'i1', serviceId: 's1', serviceName: 'Dış Yıkama', unitPrice: 25000, vatRateBp: 2000, quantity: 1, lineTotal: 25000 }],
    totals: { grossKurus: 25000, vatKurus: 4167, netKurus: 20833 },
    paidKurus: null,
    balanceKurus: null,
    allowedNext: ['KURULANIYOR'],
    ...over,
  };
}

describe('giriş', () => {
  it('oturum yoksa giriş formu; hatalı girişte sunucu mesajı', async () => {
    mockFetch((url) => (url.endsWith('/auth/login') ? { status: 401, body: { message: 'E-posta veya şifre hatalı' } } : { status: 401, body: {} }));
    render(<App />);
    fireEvent.change(await screen.findByLabelText('E-posta'), { target: { value: 'a@b.tr' } });
    fireEvent.change(screen.getByLabelText('Şifre'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Giriş yap' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('E-posta veya şifre hatalı');
  });

  it('kasiyer menüsünde yönetici sayfaları yok', async () => {
    mockFetch((url) => {
      if (url.endsWith('/auth/me')) return { status: 200, body: { user: cashier } };
      if (url.startsWith('/api/work-orders')) return { status: 200, body: empty };
    });
    render(<App />);
    const nav = await screen.findByRole('navigation', { name: 'Ana menü' });
    expect(within(nav).getByText('Müşteriler')).toBeInTheDocument();
    expect(within(nav).queryByText('Kullanıcılar')).not.toBeInTheDocument();
    expect(within(nav).queryByText('Raporlar')).not.toBeInTheDocument();
  });

  it('istek 401 alırsa giriş ekranına döner (oturum düştü)', async () => {
    let meCalls = 0;
    mockFetch((url) => {
      if (url.endsWith('/auth/me')) return meCalls++ === 0 ? { status: 200, body: { user: cashier } } : { status: 401, body: {} };
      if (url.startsWith('/api/work-orders')) return { status: 401, body: { message: 'Oturum açmanız gerekiyor' } };
    });
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Giriş yap' })).toBeInTheDocument();
  });
});

describe('personel panosu', () => {
  it('yalnız ileri durum düğmesi; yeni iş emri ve iptal yok; tıklayınca durum isteği gider', async () => {
    mockFetch((url, init) => {
      if (url.endsWith('/auth/me')) return { status: 200, body: { user: worker } };
      if (url.endsWith('/work-orders/o1/status') && init?.method === 'POST')
        return { status: 201, body: order({ status: 'KURULANIYOR', allowedNext: ['HAZIR'] }) };
      if (url.startsWith('/api/work-orders')) return { status: 200, body: { ...empty, items: [order()] } };
    });
    render(<App />);
    expect(await screen.findByText('34 ABC 123')).toBeInTheDocument();
    expect(screen.getByText('Bana atanan işler')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Yeni iş emri/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'İptal et' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Kurulamaya geç' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Hazır' })).toBeInTheDocument());
    const statusCall = calls.find((c) => c.url.endsWith('/status'))!;
    expect(JSON.parse(String(statusCall.init!.body))).toEqual({ to: 'KURULANIYOR' });
  });
});

describe('tahsilat', () => {
  it('hata sonrası tekrar denemede aynı işlem anahtarı gönderilir', async () => {
    window.history.pushState({}, '', '/is/o1');
    let payCount = 0;
    mockFetch((url, init) => {
      if (url.endsWith('/auth/me')) return { status: 200, body: { user: cashier } };
      if (url.endsWith('/users/workers')) return { status: 200, body: [] };
      if (url.endsWith('/payments')) return payCount++ === 0 ? { status: 503, body: { message: 'Bağlantı hatası' } } : undefined;
      if (url.endsWith('/work-orders/o1') && !init?.method)
        return { status: 200, body: order({ status: 'HAZIR', allowedNext: [], paidKurus: 0, balanceKurus: 25000, payments: [] }) };
    });
    render(<App />);
    expect(await screen.findByLabelText('Tutar (₺)')).toHaveValue('250,00');
    fireEvent.click(screen.getByRole('button', { name: 'Tahsil et' }));
    expect(await screen.findByText('Bağlantı hatası')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tahsil et' }));
    await waitFor(() => expect(calls.filter((c) => c.url.endsWith('/payments'))).toHaveLength(2));
    const [a, b] = calls.filter((c) => c.url.endsWith('/payments')).map((c) => JSON.parse(String(c.init!.body)));
    expect(a.idempotencyKey).toBe(b.idempotencyKey);
    expect(a.amountKurus).toBe(25000);
  });

  it('bakiyeyi aşan tutar sunucuya gönderilmez', async () => {
    window.history.pushState({}, '', '/is/o1');
    mockFetch((url, init) => {
      if (url.endsWith('/auth/me')) return { status: 200, body: { user: cashier } };
      if (url.endsWith('/users/workers')) return { status: 200, body: [] };
      if (url.endsWith('/work-orders/o1') && !init?.method)
        return { status: 200, body: order({ status: 'HAZIR', allowedNext: [], paidKurus: 0, balanceKurus: 25000, payments: [] }) };
    });
    render(<App />);
    fireEvent.change(await screen.findByLabelText('Tutar (₺)'), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tahsil et' }));
    expect(await screen.findByText(/kalan bakiyeyi/)).toBeInTheDocument();
    expect(calls.some((c) => c.url.endsWith('/payments'))).toBe(false);
  });
});
