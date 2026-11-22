#!/bin/sh
# Bilgisayarınızda tek komutla deneme kurulumu (Docker Desktop gerekir).
#   sh scripts/deneme.sh          -> kur ve başlat (örnek verilerle)
#   sh scripts/deneme.sh kapat    -> durdur (veriler kalır)
#   sh scripts/deneme.sh sil      -> durdur ve TÜM deneme verisini sil
set -eu
cd "$(dirname "$0")/.."
C="docker compose --env-file deploy/.env"

if ! docker info >/dev/null 2>&1; then
  echo "Docker çalışmıyor. Docker Desktop'ı açın (https://www.docker.com/products/docker-desktop/) ve tekrar deneyin." >&2
  exit 1
fi

case "${1:-}" in
  kapat) $C stop; echo "Durduruldu. Tekrar başlatmak için: sh scripts/deneme.sh"; exit 0 ;;
  sil) $C down -v; rm -f deploy/.env; echo "Deneme verisi silindi."; exit 0 ;;
esac

if [ ! -f deploy/.env ]; then
  pw=$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32)
  cat > deploy/.env <<ENV
DOMAIN=localhost
POSTGRES_PASSWORD=$pw
SEED_ADMIN_EMAIL=admin@otoyikama.local
SEED_ADMIN_PASSWORD=Admin123!
SMS_PROVIDER=log
BACKUP_HOUR=03
BACKUP_KEEP_DAYS=14
ENV
  echo "deploy/.env oluşturuldu (yerel deneme ayarları)."
fi

echo "İmajlar hazırlanıyor ve servisler başlatılıyor (ilk seferde birkaç dakika sürebilir)..."
if [ "${SKIP_BUILD:-}" = "1" ]; then $C up -d --no-build; else $C up -d --build; fi

printf "API bekleniyor"
i=0
until $C ps api --format '{{.Health}}' 2>/dev/null | grep -q healthy; do
  i=$((i + 1)); [ $i -gt 90 ] && { echo; echo "API başlamadı. Günlük: $C logs api" >&2; exit 1; }
  printf "."; sleep 2
done
echo " hazır."

echo "Örnek veriler yükleniyor (kullanıcılar, hizmetler, örnek iş emirleri)..."
$C exec -T -e NODE_ENV=development api npx tsx prisma/seed.ts >/dev/null

cat <<MSG

==========================================================
 Oto Yıkama hazır:  https://localhost

 Tarayıcı "bağlantı gizli değil" uyarısı verecek; bu yerel
 deneme sertifikası yüzünden. "Gelişmiş" -> "localhost'a
 ilerle" (Safari: "Ayrıntıları Göster" -> "web sitesini ziyaret et").

 Giriş bilgileri:
   Yönetici : admin@otoyikama.local    / Admin123!
   Kasiyer  : kasiyer@otoyikama.local  / Kasiyer123!
   Personel : personel@otoyikama.local / Personel123!

 Personel ekranını telefon görünümünde görmek için ayrı bir
 gizli pencerede personel ile giriş yapın.

 Durdurmak : sh scripts/deneme.sh kapat
 Silmek    : sh scripts/deneme.sh sil
==========================================================
MSG
