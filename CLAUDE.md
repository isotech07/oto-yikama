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
- **İş akışı kuralları** (sunucuda, `work-orders.service.ts`):
  - Personel (WORKER) yalnız kendisine atanan iş emrini görür (başkasınınki 404) ve yalnız
    YIKANIYOR / KURULANIYOR / HAZIR geçişlerini yapar. Teslim ve iptal kasaya (ADMIN/CASHIER) aittir.
  - Personele müşteri telefonu ve ödeme bilgisi gösterilmez.
  - **Teslim için bakiye 0 olmalı.** Tahsilatı olan iş emri iptal edilemez (önce iade).
  - Tahsilat kalan bakiyeyi aşamaz. İade = negatif tutarlı ödeme kaydı; yalnız ADMIN, açıklama zorunlu (DB CHECK).
  - Her ödeme istemci tarafından üretilen `idempotencyKey` (UUID) taşır; aynı anahtar ikinci kez kaydedilmez.
  - Tahsilat, durum, kalem ve atama değişiklikleri iş emri satırını `SELECT … FOR UPDATE` ile kilitler.
  - Kalemler soft delete edilir; ödenen tutarın altına düşürecek kalem çıkarma reddedilir.
- **Veresiye**: yalnız yöneticinin `credit_allowed` verdiği müşteri bakiyeyle teslim alır; `credit_limit_kurus` varsa
  müşterinin toplam açık borcu (teslim edilmiş işler) + bu iş limiti aşamaz (müşteri bazlı advisory lock).
- **Paketler**: satışta paket bilgisi kopyalanır ve tam ödeme alınır (ödeme `customer_package_id`'ye bağlı; ödeme ya iş emrine
  ya pakete aittir, DB CHECK). Paketle karşılanan kalem `unit_price = 0`; kredi koşullu UPDATE ile düşer, kalem çıkarılınca
  veya iş iptal edilince geri eklenir. Ciro paket satış gününde sayılır.
- **Kasa kapanışı**: gün başına tek kayıt, değiştirilemez (trigger). Kapanıştan sonra o güne NAKİT işlem alınmaz.
  Nakit tahsilat ve kapanış aynı advisory lock'u (`cash:<gün>`) alır.
- **SMS**: outbox deseni. HAZIR geçişiyle aynı transaction'da `notifications` kaydı yazılır (yalnız ayarlarda açık ve
  müşteride `sms_consent` varsa). API içindeki gönderici 15 sn'de bir `FOR UPDATE SKIP LOCKED` ile alır, üstel
  beklemeyle 5 kez dener. Testlerde `NOTIFY_WORKER=off`. Sağlayıcı: `SMS_PROVIDER=log|netgsm`.
- **Bilgi fişi** resmî belge değildir ("Mali değeri yoktur"); resmî fiş yazar kasa/ÖKC'den kesilir. e-Arşiv entegrasyonu yok.
- **Raporlar**: İstanbul günü (sabit UTC+3). Kasa = ödeme anına göre; ciro/KDV = teslim anına göre.
- **PWA**: yalnız uygulama kabuğu önbelleğe alınır; `/api` asla önbelleğe alınmaz (eski bakiye riski).
- Prisma `migrate dev` bu ortamda etkileşimsiz çalışmaz: yeni migration için şemayı değiştir,
  `prisma migrate diff --from-migrations … --to-schema-datamodel … --script` ile SQL üret, elle kısıtları ekle, `migrate deploy` uygula.
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

## Testler hakkında
- API testleri kalıcı `otoyikama_test` veritabanında çalışır; veri silinmez, her test benzersiz veri üretir.
  Gerçek "bugün"ü kapatan kasa testi yazma: saati `vi.useFakeTimers({ toFake: ['Date'] })` ile rastgele bir gelecek güne al.
- E2E (`apps/e2e`) kendi `otoyikama_e2e` veritabanını kullanır, API'yi :3100, web'i :5199'da kendisi başlatır.
- Yeni iş kuralı eklerken, kuralı geçici olarak bozup testin kırıldığını doğrula.

## Canlıya alma
`DEPLOY.md`. Üretim imajları `apps/api/Dockerfile`, `apps/web/Dockerfile` (Caddy), `docker-compose.yml`.

## Komutlar (kök dizinden)
- `npm run dev`: API (:3000) + web (:5173, `/api` proxy) birlikte
- `npm test`: tüm testler (API testleri PostgreSQL gerektirir)
- `npm run db:migrate`: Prisma migration
- `npm run db:seed`: örnek veri
- `npm run typecheck`: tip kontrolü + web build
- `npm run e2e`: Playwright uçtan uca testleri

## Çalışma biçimi
- Büyük kararlarda önce sor, sonra uygula.
- Her özellik için test yaz ve çalıştır.
- Her adımdan sonra kısa özet ver: ne değişti, hangi testler geçti.
