import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

function mockFetch(handler: (url: string, init?: RequestInit) => { status: number; body?: unknown }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const r = handler(url, init);
      return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

const cashier = { id: '1', email: 'k@x.tr', name: 'Ayşe Kasiyer', role: 'CASHIER' };

describe('App', () => {
  it('oturum yoksa giriş formunu gösterir', async () => {
    mockFetch(() => ({ status: 401, body: { message: 'Oturum açmanız gerekiyor' } }));
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Giriş yap' })).toBeInTheDocument();
  });

  it('hatalı girişte sunucu mesajını gösterir', async () => {
    mockFetch((url) =>
      url.endsWith('/auth/login')
        ? { status: 401, body: { message: 'E-posta veya şifre hatalı' } }
        : { status: 401, body: {} },
    );
    render(<App />);
    fireEvent.change(await screen.findByLabelText('E-posta'), { target: { value: 'a@b.tr' } });
    fireEvent.change(screen.getByLabelText('Şifre'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Giriş yap' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('E-posta veya şifre hatalı');
  });

  it('kasiyer girişinde yönetici menüleri görünmez', async () => {
    mockFetch((url) => (url.endsWith('/auth/login') ? { status: 200, body: { user: cashier } } : { status: 401, body: {} }));
    render(<App />);
    fireEvent.change(await screen.findByLabelText('E-posta'), { target: { value: 'k@x.tr' } });
    fireEvent.change(screen.getByLabelText('Şifre'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Giriş yap' }));
    await waitFor(() => expect(screen.getByText('Hoş geldiniz, Ayşe')).toBeInTheDocument());
    expect(screen.getByText('Tahsilat')).toBeInTheDocument();
    expect(screen.queryByText('Kullanıcılar')).not.toBeInTheDocument();
  });
});
