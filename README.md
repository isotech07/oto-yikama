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

## API

| Metot | Yol               | Erişim       |
|-------|-------------------|--------------|
| GET   | /api/health       | herkese açık |
| POST  | /api/auth/login   | herkese açık (IP başına 10/dk) |
| POST  | /api/auth/logout  | tüm roller   |
| GET   | /api/auth/me      | tüm roller   |
