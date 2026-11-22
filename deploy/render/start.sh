#!/bin/sh
# Açılış: veritabanı adresini doğrula/düzelt, migration'ları uygula, istenirse örnek veri, API'yi başlat.
set -e

if [ -z "${DATABASE_URL:-}" ]; then
  echo "HATA: DATABASE_URL tanımlı değil. Render > Environment bölümüne Neon bağlantı adresini girin." >&2
  exit 1
fi
case "$DATABASE_URL" in
  postgres://*|postgresql://*) ;;
  *) echo "HATA: DATABASE_URL 'postgresql://' ile başlamalı (Neon > Connect penceresindeki adres)." >&2; exit 1 ;;
esac

# Neon adresini Prisma'ya uygun hale getir (değer loglanmaz):
#  - channel_binding parametresini kaldır (Prisma desteklemiyor)
#  - '-pooler' adresini doğrudan bağlantıya çevir (migration'lar havuzlu bağlantıda çalışmaz)
#  - uyuyan Neon'un uyanması için bağlantı zaman aşımını uzat; ücretsiz planda bağlantı sayısını sınırla
url=$(printf '%s' "$DATABASE_URL" | sed -E 's/channel_binding=[^&]*&?//; s/[?&]$//; s/\?&/?/; s/-pooler\././')
case "$url" in *\?*) sep='&' ;; *) sep='?' ;; esac
case "$url" in *sslmode=*) ;; *) url="${url}${sep}sslmode=require"; sep='&' ;; esac
case "$url" in *connect_timeout=*) ;; *) url="${url}${sep}connect_timeout=30" ;; esac
case "$url" in *connection_limit=*) ;; *) url="${url}&connection_limit=5" ;; esac
export DATABASE_URL="$url"

echo "1/3 Veritabanı migration'ları uygulanıyor..."
if ! npx prisma migrate deploy; then
  echo "HATA: Veritabanına bağlanılamadı ya da migration başarısız. DATABASE_URL'yi kontrol edin (Neon > Connect, pooling kapalı)." >&2
  exit 1
fi

if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "2/3 Başlangıç verileri yükleniyor..."
  npx tsx prisma/seed.ts
else
  echo "2/3 Başlangıç verisi atlandı (SEED_ON_START=false)."
fi

echo "3/3 Uygulama başlatılıyor (port ${PORT:-3000})..."
exec node dist/main.js
