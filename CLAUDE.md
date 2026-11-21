# Oto Yıkama Yönetim Uygulaması

## Proje özeti
Tek şubeli oto yıkama işletmesi için web tabanlı yönetim uygulaması (PWA).
Arayüz Türkçe, para birimi TL, KDV desteği var.

## Teknoloji
- Frontend: React + TypeScript + Tailwind CSS (Vite) — `apps/web`
- Backend: Node.js + TypeScript + NestJS — `apps/api`
- Veritabanı: PostgreSQL + Prisma
- Doğrulama: e-posta/şifre (bcrypt), sunucu tarafı session (httpOnly çerez), rol bazlı yetki
- Test: Vitest (birim + entegrasyon), Playwright (uçtan uca, sonra)

## Alınmış kararlar
- **NestJS** seçildi. Global `AuthGuard` her endpoint'te çalışır: `@Public()` yoksa oturum zorunlu,
  `@Roles(...)` yoksa istek **403 ile reddedilir** (varsayılan: reddet). Yeni endpoint yazarken `@Roles` unutulursa açık kalmaz.
- **Session**: çerezde rastgele token (`oy_sid`), DB'de yalnızca SHA-256 özeti (`sessions.token_hash`). Süre 12 saat.
  Kullanıcı pasife alınınca/silinince oturumları anında düşer (her istekte DB kontrolü).
- **Para**: kuruş cinsinden `Int` (125,50 TL = 12550). KDV oranı baz puan (`%20 = 2000`).
  Fiyatlar **KDV dahil** girilir; KDV satır bazında içinden ayrıştırılır (`src/domain/money.ts`).
- Prisma'nın ifade edemediği kısıtlar migration SQL'ine elle eklenir (plaka formatı CHECK, kısmi unique index'ler,
  ödeme değiştirilemezlik trigger'ı). Yeni migration'larda da bu kısıtları koru.
- Testler `otoyikama_test` veritabanında çalışır, veri silmez; her test benzersiz e-posta/plaka üretir.
- Dev sunucusu SWC ile çalışır (`@swc-node/register`); `tsx`/esbuild NestJS decorator metadata'sı üretmez.

## Roller
- ADMIN (yönetici): her şey
- CASHIER (kasiyer): müşteri/araç kaydı, iş emri açma, tahsilat
- WORKER (personel): atandığı iş emrinin durumunu güncelleme

## Kurallar
- Yetki kontrolü her API endpoint'inde sunucu tarafında yapılır, sadece arayüzde gizlemek yetmez.
- Fiyat, iş emrine eklendiği anda kopyalanır (`work_order_items.unit_price`). Sonradan fiyat değişse de geçmiş iş emirleri etkilenmez.
- Plaka benzersiz olarak normalize edilir (büyük harf, boşluksuz). Aynı plakaya aynı anda iki açık iş emri açılamaz (veritabanı kısıtı).
- İş emri durumları yalnızca izin verilen geçişlerle değişir:
  BEKLIYOR → YIKANIYOR → KURULANIYOR → HAZIR → TESLIM_EDILDI
  (İptal: BEKLIYOR veya YIKANIYOR'dan CANCELLED'a geçebilir.)
- Silme yerine soft delete kullanılır (`deleted_at`). Ödeme kayıtları hiçbir zaman silinmez.
- Müşteri telefon ve plaka bilgisi kişisel veridir; loglara açık yazılmaz (gerekirse `maskPlate`).
- Para tutarları `numeric(10,2)` veya kuruş cinsinden integer tutulur, float kullanılmaz. (Seçilen: kuruş integer.)

## Komutlar (kök dizinden)
- `npm run dev`: API (:3000) + web (:5173, `/api` proxy) birlikte
- `npm test`: tüm testler (API testleri PostgreSQL gerektirir)
- `npm run db:migrate`: Prisma migration
- `npm run db:seed`: örnek veri
- `npm run typecheck`: tip kontrolü + web build

## Çalışma biçimi
- Büyük kararlarda önce sor, sonra uygula.
- Her özellik için test yaz ve çalıştır.
- Her adımdan sonra kısa özet ver: ne değişti, hangi testler geçti.
