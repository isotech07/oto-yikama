import { type Browser, devices, expect, type Page } from '@playwright/test';

export const USERS = {
  admin: { email: 'admin@otoyikama.local', password: 'Admin123!' },
  cashier: { email: 'kasiyer@otoyikama.local', password: 'Kasiyer123!' },
  worker: { email: 'personel@otoyikama.local', password: 'Personel123!' },
} as const;

export async function login(page: Page, who: keyof typeof USERS) {
  await page.goto('/');
  await page.getByLabel('E-posta').fill(USERS[who].email);
  await page.getByLabel('Şifre').fill(USERS[who].password);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByRole('button', { name: 'Çıkış' })).toBeVisible();
}

/** Ayrı oturum (ayrı çerez) ile yeni sayfa; isteğe bağlı telefon görünümü. */
export async function newSession(browser: Browser, who: keyof typeof USERS, mobile = false) {
  const ctx = await browser.newContext(mobile ? { ...devices['iPhone 13'], locale: 'tr-TR', timezoneId: 'Europe/Istanbul' } : {});
  const page = await ctx.newPage();
  page.on('dialog', (d) => void d.accept());
  await login(page, who);
  return page;
}

/** Benzersiz, geçerli Türk plakası biçiminde: "16 E 12345" gibi. */
export function randomPlate(): string {
  const letters = 'ABCDEFGHJKLMNPRSTUVYZ';
  const l = Array.from({ length: 3 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
  return `${10 + Math.floor(Math.random() * 70)} ${l} ${100 + Math.floor(Math.random() * 900)}`;
}

export const uniqueName = (base: string) => `${base} ${Date.now().toString(36).slice(-5).toUpperCase()}`;

/** Yeni iş emri ekranında plaka + hizmet seçip iş emrini açar; iş emri sayfasının URL'sini döner. */
export async function createWorkOrder(
  page: Page,
  opts: { plate: string; services: string[]; customer?: { name: string; phone?: string; sms?: boolean } | { search: string }; worker?: string; usePackageFor?: string },
) {
  await page.goto('/yeni');
  await page.getByLabel('Plaka').fill(opts.plate);
  await expect(page.getByText(/Yeni araç|Kayıtlı araç/)).toBeVisible();
  if (opts.customer && 'name' in opts.customer) {
    await page.getByRole('button', { name: '+ Yeni müşteri' }).click();
    await page.getByLabel('Ad soyad').fill(opts.customer.name);
    if (opts.customer.phone) await page.getByLabel('Telefon').fill(opts.customer.phone);
    if (opts.customer.sms) await page.getByLabel(/SMS bildirimi almayı kabul etti/).check();
    await page.getByRole('button', { name: 'Müşteriyi kaydet' }).click();
    await expect(page.getByRole('button', { name: 'Değiştir' })).toBeVisible();
  } else if (opts.customer && 'search' in opts.customer) {
    await page.getByLabel('Ad veya telefon').fill(opts.customer.search);
    await page.getByRole('button', { name: new RegExp(opts.customer.search) }).first().click();
  }
  for (const s of opts.services) await page.getByRole('button', { name: new RegExp(`^${s} `) }).click();
  if (opts.usePackageFor) await page.getByLabel(/Paketten/).check();
  if (opts.worker) await page.getByLabel('Personel').selectOption({ label: opts.worker });
  await page.getByRole('button', { name: 'İş emrini aç' }).click();
  await page.waitForURL(/\/is\/[0-9a-f-]{36}$/);
  return page.url();
}
