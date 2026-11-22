import { describe, expect, it, vi } from 'vitest';
import { backoffMs, renderTemplate } from './notifications.service';
import { createSmsProvider, NetgsmSmsProvider } from './sms-provider';

describe('şablon ve yeniden deneme', () => {
  it('değişkenleri doldurur, bilinmeyeni bırakır', () => {
    expect(renderTemplate('Sayın {musteri}, {plaka} hazır. {x}', { musteri: 'Ali', plaka: '34ABC1' })).toBe('Sayın Ali, 34ABC1 hazır. {x}');
  });
  it('üstel bekleme 1-2-4 dk, en fazla 60 dk', () => {
    expect([1, 2, 3, 10].map((a) => backoffMs(a) / 60000)).toEqual([1, 2, 4, 60]);
  });
});

describe('Netgsm sağlayıcısı', () => {
  const ok = (text: string, status = 200) => vi.fn(async () => new Response(text, { status }));

  it('"00 <no>" başarılıdır; numara 90 ile, Türkçe karakter kipiyle gönderilir', async () => {
    const f = ok('00 123456');
    await new NetgsmSmsProvider('u', 'p', 'BASLIK', f as unknown as typeof fetch).send('5321234567', 'Aracınız hazır');
    const url = new URL(String((f.mock.calls[0] as unknown[])[0]));
    expect(url.searchParams.get('gsmno')).toBe('905321234567');
    expect(url.searchParams.get('message')).toBe('Aracınız hazır');
    expect(url.searchParams.get('dil')).toBe('TR');
  });

  it('hata kodu ve HTTP hatası fırlatır; hata mesajı telefon içermez', async () => {
    const p = (f: unknown) => new NetgsmSmsProvider('u', 'p', 'H', f as typeof fetch);
    await expect(p(ok('30')).send('5321234567', 'x')).rejects.toThrow(/hata kodu 30/);
    await expect(p(ok('', 500)).send('5321234567', 'x')).rejects.toThrow(/HTTP 500/);
    await p(ok('30')).send('5321234567', 'x').catch((e: Error) => expect(e.message).not.toContain('532'));
  });

  it('netgsm seçilip bilgiler eksikse açılışta hata verir; varsayılan log sağlayıcı', () => {
    expect(() => createSmsProvider({ SMS_PROVIDER: 'netgsm' })).toThrow(/NETGSM_USERCODE/);
    expect(createSmsProvider({}).name).toBe('log');
  });
});
