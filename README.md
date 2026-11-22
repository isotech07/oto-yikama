# Oto Yıkama Yönetim Uygulaması

Tek şubeli oto yıkama işletmesi için yönetim uygulaması. Ayrıntılar ve kurallar: [CLAUDE.md](CLAUDE.md).

## Kurulum

Gereksinimler: Node.js 22+, PostgreSQL 16.

```bash
npm install
cp apps/api/.env.example apps/api/.env   # DATABASE_URL'i düzenleyin
# Test için apps/api/.env.test: adı _test ile biten ayrı bir veritabanı
npm run db:migrate
npm run db:seed
npm run dev
```

Web: http://localhost:5173 · API: http://localhost:3000/api

### Geliştirme kullanıcıları (yalnızca seed, üretimde oluşturulmaz)

| Rol      | E-posta                    | Şifre        |
|----------|----------------------------|--------------|
| Yönetici | admin@otoyikama.local      | Admin123!    |
| Kasiyer  | kasiyer@otoyikama.local    | Kasiyer123!  |
| Personel | personel@otoyikama.local   | Personel123! |

## Ekranlar

| Ekran | Roller |
|---|---|
| İş emri panosu (açık işler durum sütunlarında, 15 sn'de yenilenir) + geçmiş | hepsi (personel yalnız kendi işleri) |
| Yeni iş emri (plaka ile otomatik araç/müşteri bulma) | Yönetici, Kasiyer |
| İş emri detayı: hizmet ekle/çıkar, atama, not, tahsilat, iade (yönetici) | hepsi (personel salt durum) |
| Müşteriler ve araçlar | Yönetici, Kasiyer |
| Hizmetler ve fiyatlar, Kullanıcılar, Raporlar | Yönetici |

Uygulama PWA olarak telefona/tablete kurulabilir (üretim derlemesinde).

## API

Tüm uçlar `/api` altındadır. Yetki sunucuda kontrol edilir; `@Roles` tanımı olmayan uç 403 döner.

| Metot | Yol | Erişim |
|---|---|---|
| GET | /health | herkese açık |
| POST | /auth/login | herkese açık (IP başına 10/dk) |
| POST | /auth/logout · GET /auth/me | tüm roller |
| GET/POST | /customers · GET/PATCH /customers/:id | Yönetici, Kasiyer |
| DELETE | /customers/:id | Yönetici (soft delete) |
| GET | /vehicles/lookup?plate= · /vehicles/:id | Yönetici, Kasiyer |
| POST/PATCH | /vehicles · /vehicles/:id | Yönetici, Kasiyer |
| DELETE | /vehicles/:id | Yönetici |
| GET | /services | Yönetici, Kasiyer |
| POST/PATCH/DELETE | /services · /services/:id | Yönetici |
| GET | /users/workers | Yönetici, Kasiyer |
| GET/POST/PATCH/DELETE | /users · /users/:id | Yönetici |
| GET | /work-orders · /work-orders/:id | tüm roller (personel yalnız kendisine atananlar) |
| POST | /work-orders | Yönetici, Kasiyer |
| POST | /work-orders/:id/status | tüm roller (personel kısıtlı) |
| PATCH | /work-orders/:id/assign · /work-orders/:id/note | Yönetici, Kasiyer |
| POST/DELETE | /work-orders/:id/items · /work-orders/:id/items/:itemId | Yönetici, Kasiyer |
| POST | /work-orders/:id/payments | Yönetici, Kasiyer (iade: negatif tutar, yalnız Yönetici) |
| GET | /reports/summary?from=&to= | Yönetici |
