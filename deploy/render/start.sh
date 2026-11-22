#!/bin/sh
# Açılış: bekleyen migration'ları uygula, istenirse örnek veri/ilk yöneticiyi oluştur (tekrar çalıştırmak güvenli), API'yi başlat.
set -e
npx prisma migrate deploy
if [ "${SEED_ON_START:-false}" = "true" ]; then
  npx tsx prisma/seed.ts
fi
exec node dist/main.js
