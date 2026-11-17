#!/usr/bin/env bash
# Perbarui VM ke commit terbaru di main lalu jalankan ulang stack.
# Dipakai manual (./deploy/gce/deploy.sh) dan oleh GitHub Action deploy.
# PERINGATAN: `git reset --hard` membuang perubahan lokal di clone VM.
# File rahasia (backend.env, voice.env, .env) di-gitignore sehingga aman.
set -euo pipefail

main() {
  cd "$(dirname "$0")/../.."
  git fetch origin main
  git reset --hard origin/main
  echo "Deploy commit: $(git rev-parse --short HEAD)"

  cd deploy/gce
  docker compose up -d --build --remove-orphans
  docker image prune -f >/dev/null

  # /health selalu HTTP 200; yang dicek adalah field db.
  for _ in $(seq 1 12); do
    if curl -fsS http://127.0.0.1:4000/health | grep -q '"db":"ok"'; then
      echo "OK: backend hidup dan DB terhubung"
      return 0
    fi
    sleep 10
  done
  echo "GAGAL: /health tidak mengembalikan db=ok. Log terakhir:" >&2
  docker compose logs --tail=50 backend >&2
  return 1
}

# Seluruh isi dibungkus fungsi + exit: git reset bisa menimpa file ini saat berjalan.
main "$@"
exit $?
