#!/bin/sh
# Her gün BACKUP_HOUR'da (İstanbul saati) veritabanının sıkıştırılmış dökümünü alır,
# BACKUP_KEEP_DAYS günden eski dökümleri siler. Açılışta bir yedek de hemen alınır.
set -eu
: "${BACKUP_HOUR:=03}"
: "${BACKUP_KEEP_DAYS:=14}"
export TZ=Europe/Istanbul

backup() {
  f="/backups/otoyikama-$(date +%Y%m%d-%H%M%S).dump"
  if pg_dump -Fc -f "$f.tmp"; then
    mv "$f.tmp" "$f"
    echo "$(date -Iseconds) yedek alındı: $f ($(du -h "$f" | cut -f1))"
    find /backups -name 'otoyikama-*.dump' -mtime +"$BACKUP_KEEP_DAYS" -delete
  else
    rm -f "$f.tmp"
    echo "$(date -Iseconds) HATA: yedek alınamadı" >&2
  fi
}

backup
last=$(date +%F)
while true; do
  sleep 300
  if [ "$(date +%H)" = "$BACKUP_HOUR" ] && [ "$(date +%F)" != "$last" ]; then
    backup
    last=$(date +%F)
  fi
done
