# Canlıya alma

Tek sunucuda Docker Compose ile çalışır: **PostgreSQL + API + Caddy (HTTPS, otomatik sertifika) + günlük yedek**.

## 1. Sunucu

- Ubuntu 22.04/24.04, en az 2 GB RAM (1 vCPU yeterli). Örn. Hetzner CX22, DigitalOcean 2 GB droplet.
- Bir alan adı (örn. `kasa.isletmeniz.com`) ve DNS'te sunucunun IP'sini gösteren **A kaydı**.
- 80 ve 443 portları açık olmalı (Caddy sertifikayı bu portlarla alır).

Docker kurulumu:

```bash
curl -fsSL https://get.docker.com | sh
```

## 2. Kurulum

```bash
git clone <depo-adresi> oto-yikama && cd oto-yikama
cp deploy/.env.example deploy/.env
nano deploy/.env        # DOMAIN, POSTGRES_PASSWORD, SEED_ADMIN_* doldurun
docker compose --env-file deploy/.env up -d --build
```

İlk yöneticiyi oluşturun (yalnız bir kez):

```bash
docker compose --env-file deploy/.env exec api npm run db:seed:prod
```

Ardından `https://<DOMAIN>` adresinden giriş yapın ve sırayla:
1. **Ayarlar** → işletme adı, adres, vergi bilgileri (fişte görünür).
2. **Hizmetler** → hizmet ve fiyatlar; isterseniz paketler.
3. **Kullanıcılar** → kasiyer ve personel hesapları.
4. Yönetici şifresini değiştirin ve `deploy/.env` içindeki `SEED_ADMIN_PASSWORD` satırını silin.

Telefona/tablete kurmak için: tarayıcıda siteyi açın → "Ana ekrana ekle".

## 3. Güncelleme

```bash
git pull
docker compose --env-file deploy/.env up -d --build
```

API açılırken bekleyen veritabanı migration'larını kendisi uygular. Güncellemeden önce elle yedek almak isterseniz:

```bash
docker compose --env-file deploy/.env restart backup   # açılışta hemen bir yedek alır
```

## 4. Yedekleme ve geri yükleme

- `backup` servisi her gün `BACKUP_HOUR` saatinde (İstanbul) `deploy/backups/` klasörüne yedek alır, `BACKUP_KEEP_DAYS` günden eskileri siler.
- **Yedekler aynı sunucuda durur.** Sunucu kaybına karşı bu klasörü düzenli olarak başka yere kopyalayın
  (örn. `rclone` ile Google Drive / S3, ya da haftada bir bilgisayarınıza `scp`).

Geri yükleme (mevcut veriyi yedektekiyle **değiştirir**, onay ister):

```bash
deploy/restore.sh deploy/backups/otoyikama-YYYYMMDD-HHMMSS.dump
```

## 5. SMS (isteğe bağlı)

1. Netgsm hesabı açın, onaylı bir **SMS başlığı** alın.
2. `deploy/.env`: `SMS_PROVIDER=netgsm`, `NETGSM_USERCODE`, `NETGSM_PASSWORD`, `NETGSM_HEADER`.
3. `docker compose --env-file deploy/.env up -d` ile API'yi yeniden başlatın.
4. **Ayarlar** → "Hazır olunca SMS gönder" işaretleyin.
5. Kendi numaranızla, SMS izni verilmiş bir test müşterisi oluşturup bir işi Hazır'a alın; iş emri sayfasında "SMS: gönderildi" görünmeli.

> Netgsm adaptörü Netgsm'in HTTP GET API'sine göre yazıldı ancak gerçek hesapla denenmedi. İlk kullanımda 5. adımı mutlaka yapın;
> sorun olursa iş emri sayfasındaki SMS etiketinin üzerine gelince hata kodu görünür.

SMS yalnız müşteri kartında **SMS izni** işaretli müşterilere gider (KVKK açık rıza).

## 6. İzleme

```bash
docker compose --env-file deploy/.env ps        # tüm servisler "healthy/running" olmalı
docker compose --env-file deploy/.env logs -f api
ls -lh deploy/backups/                          # son yedeğin tarihi bugün/dün olmalı
```

Loglarda telefon ve plaka açık yazılmaz.
