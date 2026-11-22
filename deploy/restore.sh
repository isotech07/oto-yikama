#!/bin/sh
# Kullanım (depo kökünden): deploy/restore.sh deploy/backups/otoyikama-YYYYMMDD-HHMMSS.dump
# DİKKAT: Mevcut veritabanının içeriğini yedektekiyle DEĞİŞTİRİR. İşlem süresince API durdurulur.
set -eu
cd "$(dirname "$0")/.."
C="docker compose --env-file deploy/.env"
[ -f "${1:-}" ] || { echo "Yedek dosyası verin: $0 deploy/backups/<dosya>.dump" >&2; exit 1; }
[ -f deploy/.env ] || { echo "deploy/.env bulunamadı" >&2; exit 1; }
printf "Veritabanı '%s' ile değiştirilecek. Devam için EVET yazın: " "$1"
read -r ok
[ "$ok" = "EVET" ] || { echo "İptal edildi."; exit 1; }
$C stop api
# Hata olsa da API yeniden başlatılsın
trap '$C start api >/dev/null' EXIT
$C exec -T db sh -c 'pg_restore --clean --if-exists --no-owner --single-transaction -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$1"
echo "Geri yükleme tamamlandı."
