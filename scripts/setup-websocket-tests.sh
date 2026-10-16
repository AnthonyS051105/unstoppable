#!/usr/bin/env bash
#
# setup-websocket-tests.sh — Siapkan SEMUA prasyarat REST untuk uji event WebSocket,
# lalu cetak token + ID yang dibutuhkan docs/testing-websocket.md.
#
# Mengerjakan (idempoten, aman diulang):
#   - Login BUDI, CAHYA (caregiver), RINA, ADMIN  (semua sudah terdaftar+verified)
#   - Login RINA2 bila ada (opsional, untuk skenario companion:not_selected)
#   - Tautkan ulang CAHYA sebagai caregiver BUDI (mode 'always')  -> wajib untuk location:shared
#   - Pastikan RINA relawan verified + aktif + punya availability yang mencakup lokasi/jam uji
#   - (bila RINA2 ada) hal yang sama untuk RINA2
#   - Mulai 1 travel session milik BUDI            -> SESSION_ID (untuk location:update / SOS)
#   - Buat 1 companion request milik BUDI           -> REQUEST_ID (untuk skenario companion)
#
# Prasyarat:
#   - backend jalan di $BASE (default http://localhost:4000)
#   - `jq` terpasang
#   - ADMIN ($PHONE_ADMIN) ber-role 'admin' di DB
#
# Jalankan:
#   bash scripts/setup-websocket-tests.sh
#
set -euo pipefail
set +H  # matikan history expansion supaya '!' di password aman

BASE="${BASE:-http://localhost:4000}"
PASSWORD="${PASSWORD:-Rahasia123!}"

PHONE_BUDI="081200000001"
PHONE_CAHYA="081200000004"
PHONE_RINA="081200000003"
PHONE_RINA2="081200000006"   # opsional (companion:not_selected). Ganti bila nomor lain.
PHONE_ADMIN="081200000009"

# lokasi & waktu uji (dipakai untuk availability relawan)
TEST_LNG=110.3730
TEST_LAT=-7.7658

RED=$'\e[31m'; GRN=$'\e[32m'; YLW=$'\e[33m'; BLU=$'\e[34m'; BLD=$'\e[1m'; RST=$'\e[0m'
info() { printf '%s[*]%s %s\n' "$BLU" "$RST" "$*"; }
ok()   { printf '%s[OK]%s %s\n' "$GRN" "$RST" "$*"; }
warn() { printf '%s[!]%s %s\n' "$YLW" "$RST" "$*"; }
die()  { printf '%s[x]%s %s\n' "$RED" "$RST" "$*" >&2; exit 1; }

command -v jq >/dev/null 2>&1 || die "jq tidak ditemukan. Pasang: sudo apt install jq"

code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/health" || true)
[ "$code" = "200" ] || die "Backend tidak merespons 200 di $BASE/health (dapat: ${code:-kosong}). Jalankan 'npm run dev' di backend/."
ok "Backend hidup di $BASE"

# Cache token di file supaya tidak login berulang (authLimiter = 5 login / 15 menit / IP).
# Hapus cache untuk login paksa:  rm -f .ws-token-cache/*
CACHE_DIR="${CACHE_DIR:-.ws-token-cache}"
mkdir -p "$CACHE_DIR"

# token_for <phone> <cacheName> -> echo accessToken (pakai cache bila masih valid)
# Validitas dicek via GET /users/me. Hanya login kalau cache kosong/kedaluwarsa.
token_for() {
  local phone="$1" name="$2" file="$CACHE_DIR/$2.token" tok=""
  if [ -f "$file" ]; then
    tok=$(cat "$file")
    if [ -n "$tok" ] && curl -s -o /dev/null -w '%{http_code}' "$BASE/api/users/me" \
        -H "Authorization: Bearer $tok" | grep -q '^200$'; then
      echo "$tok"; return 0
    fi
  fi
  local resp code
  resp=$(curl -s -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
    --data-binary "{\"phoneNumber\":\"$phone\",\"password\":\"$PASSWORD\"}")
  tok=$(echo "$resp" | jq -r '.data.accessToken // empty')
  if [ -z "$tok" ]; then
    code=$(echo "$resp" | jq -r '.error.code // "UNKNOWN"')
    if [ "$code" = "RATE_LIMITED" ]; then
      die "Login $name kena RATE_LIMITED (authLimiter 5/15menit/IP). Set env AUTH_LOGIN_MAX lebih tinggi di backend/.env lalu restart dev server, atau tunggu 15 menit. Token lama yang masih valid dipakai dari cache $CACHE_DIR/."
    fi
    die "Login $name gagal: $(echo "$resp" | jq -c '.error // .')"
  fi
  echo "$tok" > "$file"
  echo "$tok"
}

# ---------- 1. LOGIN aktor inti (via cache) ----------
info "Ambil token aktor inti (cache: $CACHE_DIR) ..."
BUDI=$(token_for "$PHONE_BUDI" budi)
CAHYA=$(token_for "$PHONE_CAHYA" cahya)
ADMIN=$(token_for "$PHONE_ADMIN" admin)
RINA=$(token_for "$PHONE_RINA" rina)
RINA_ID=$(curl -s "$BASE/api/users/me" -H "Authorization: Bearer $RINA" | jq -r '.data.id // empty')
[ -n "$RINA_ID" ] || die "Tidak bisa ambil rinaUserId."
ok "Token BUDI/CAHYA/RINA/ADMIN siap. rinaUserId=$RINA_ID"

# BUDI userId (buat info)
BUDI_ID=$(curl -s "$BASE/api/users/me" -H "Authorization: Bearer $BUDI" | jq -r '.data.id // empty')

# ADMIN harus role admin (verifikasi relawan butuh ini)
ADMIN_ROLE=$(curl -s "$BASE/api/users/me" -H "Authorization: Bearer $ADMIN" | jq -r '.data.role // empty')
[ "$ADMIN_ROLE" = "admin" ] || die "Role ADMIN='$ADMIN_ROLE'. Jalankan di DB: UPDATE users SET role='admin' WHERE phone_number='$PHONE_ADMIN'; lalu ulangi."

# RINA2 opsional — pakai cache juga, tapi JANGAN die kalau gagal (akun bisa belum ada).
RINA2=""; RINA2_ID=""
if [ -f "$CACHE_DIR/rina2.token" ] && \
   curl -s -o /dev/null -w '%{http_code}' "$BASE/api/users/me" \
     -H "Authorization: Bearer $(cat "$CACHE_DIR/rina2.token")" | grep -q '^200$'; then
  RINA2=$(cat "$CACHE_DIR/rina2.token")
else
  RINA2=$(curl -s -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
    --data-binary "{\"phoneNumber\":\"$PHONE_RINA2\",\"password\":\"$PASSWORD\"}" | jq -r '.data.accessToken // empty')
  [ -n "$RINA2" ] && echo "$RINA2" > "$CACHE_DIR/rina2.token"
fi
if [ -n "$RINA2" ]; then
  RINA2_ID=$(curl -s "$BASE/api/users/me" -H "Authorization: Bearer $RINA2" | jq -r '.data.id // empty')
  ok "RINA2 siap. rina2UserId=$RINA2_ID"
else
  warn "RINA2 ($PHONE_RINA2) belum ada / tidak bisa login."
  warn "Skenario companion:not_selected butuh relawan kedua. Daftarkan manual (register + OTP + verify)"
  warn "atau ganti PHONE_RINA2 di skrip ke relawan verified yang sudah ada. Skenario lain tetap jalan."
fi

# ---------- 2. Tautkan ulang CAHYA sebagai caregiver BUDI (mode always) ----------
# WAJIB untuk location:shared. Pengujian storyline sebelumnya menghapus relasi ini.
info "Pastikan CAHYA tertaut sebagai caregiver BUDI (mode always) ..."
HAS_CAHYA=$(curl -s "$BASE/api/users/me/caregivers" -H "Authorization: Bearer $BUDI" \
  | jq -r --arg ph "$PHONE_CAHYA" '[.data[]? | select((.caregiver.phoneNumber // .phoneNumber // "") | test($ph[-4:]))] | length' 2>/dev/null || echo 0)
LINK_RESP=$(curl -s -X POST "$BASE/api/users/me/caregivers" \
  -H "Authorization: Bearer $BUDI" -H "Content-Type: application/json" \
  --data-binary "{\"caregiverPhone\":\"$PHONE_CAHYA\",\"relationshipType\":\"primary\",\"locationSharingMode\":\"always\"}")
if echo "$LINK_RESP" | jq -e '.success == true' >/dev/null 2>&1; then
  ok "CAHYA ditautkan ulang (mode always)."
else
  CODE=$(echo "$LINK_RESP" | jq -r '.error.code // empty')
  if [ "$CODE" = "CONFLICT" ]; then
    ok "CAHYA sudah tertaut sebelumnya (CONFLICT = aman)."
  else
    warn "Tautan caregiver tidak sukses: $(echo "$LINK_RESP" | jq -c '.error // .'). location:shared mungkin tidak muncul."
  fi
fi

# ---------- 3. RINA relawan verified + aktif + availability ----------
ensure_volunteer_ready() {
  local token="$1" uid="$2" label="$3"
  local me vstatus
  me=$(curl -s "$BASE/api/volunteers/me" -H "Authorization: Bearer $token")
  vstatus=$(echo "$me" | jq -r '.data.verificationStatus // empty')
  if [ "$vstatus" != "verified" ]; then
    info "$label belum verified (status='$vstatus') -> apply + verifikasi admin ..."
    curl -s -X POST "$BASE/api/volunteers/apply" -H "Authorization: Bearer $token" -H "Content-Type: application/json" \
      --data-binary '{"motivation":"Ingin membantu teman difabel di FT & FMIPA.","idCardUrl":"https://cdn.ugm.ac.id/ktm/relawan.jpg","serviceAreaNote":"Sekitar FT & FMIPA UGM"}' >/dev/null || true
    local vr
    vr=$(curl -s -X PATCH "$BASE/api/volunteers/$uid/verification" -H "Authorization: Bearer $ADMIN" -H "Content-Type: application/json" \
      --data-binary '{"verificationStatus":"verified","canCompanion":true,"canMapData":true}')
    echo "$vr" | jq -e '.success == true' >/dev/null || die "Verifikasi $label gagal: $(echo "$vr" | jq -c '.error // .')"
  fi
  # aktifkan
  curl -s -X PATCH "$BASE/api/volunteers/me" -H "Authorization: Bearer $token" -H "Content-Type: application/json" \
    --data-binary '{"isActive":true}' >/dev/null || true
  # availability mencakup lokasi uji, semua hari praktis -> buat 7 hari supaya cocok kapan saja
  local existing
  existing=$(curl -s "$BASE/api/volunteers/availability" -H "Authorization: Bearer $token" | jq -r '.data | length' 2>/dev/null || echo 0)
  if [ "${existing:-0}" -eq 0 ]; then
    for d in 0 1 2 3 4 5 6; do
      curl -s -X POST "$BASE/api/volunteers/availability" -H "Authorization: Bearer $token" -H "Content-Type: application/json" \
        --data-binary "{\"centerPoint\":{\"type\":\"Point\",\"coordinates\":[$TEST_LNG,$TEST_LAT]},\"radiusMeters\":5000,\"dayOfWeek\":$d,\"startTime\":\"00:00\",\"endTime\":\"23:59\"}" >/dev/null || true
    done
  fi
  ok "$label siap: verified + aktif + availability (radius 5km, 7 hari, 00:00-23:59)."
}

info "Siapkan RINA sebagai relawan siap-tugas ..."
ensure_volunteer_ready "$RINA" "$RINA_ID" "RINA"
if [ -n "$RINA2" ]; then
  info "Siapkan RINA2 sebagai relawan siap-tugas ..."
  ensure_volunteer_ready "$RINA2" "$RINA2_ID" "RINA2"
fi

# ---------- 4. SESSION_ID (BUDI) untuk location:update & SOS ----------
info "Mulai travel session BUDI ..."
SESSION_ID=$(curl -s -X POST "$BASE/api/sessions/start" -H "Authorization: Bearer $BUDI" -H "Content-Type: application/json" \
  --data-binary '{"origin":{"type":"Point","coordinates":[110.3718,-7.7655]},"destination":{"type":"Point","coordinates":[110.3740,-7.7662]},"destinationName":"Pintu GIK","profileId":"wheelchair"}' \
  | jq -r '.data.id // empty')
[ -n "$SESSION_ID" ] || die "Gagal membuat travel session."
ok "SESSION_ID=$SESSION_ID"

# ---------- 5. REQUEST_ID (BUDI) untuk skenario companion ----------
info "Buat companion request BUDI (scheduledStart = besok) ..."
TOMORROW=$(date -u -d "+1 day" '+%Y-%m-%dT09:00:00+07:00' 2>/dev/null || date -u -v+1d '+%Y-%m-%dT09:00:00+07:00')
REQUEST_ID=$(curl -s -X POST "$BASE/api/companions/requests" -H "Authorization: Bearer $BUDI" -H "Content-Type: application/json" \
  --data-binary "{\"destinationName\":\"Seminar di GIK Lantai 2\",\"destinationLocation\":{\"type\":\"Point\",\"coordinates\":[110.3740,-7.7662]},\"meetingPointLocation\":{\"type\":\"Point\",\"coordinates\":[$TEST_LNG,$TEST_LAT]},\"meetingPointNote\":\"Depan gerbang utama FT\",\"scheduledStart\":\"$TOMORROW\",\"estimatedDurationMin\":120,\"assistanceTypes\":[\"memandu_jalan\",\"bantu_kursi_roda\"],\"notes\":\"Saya pakai kursi roda manual.\"}" \
  | jq -r '.data.id // empty')
[ -n "$REQUEST_ID" ] || die "Gagal membuat companion request."
ok "REQUEST_ID=$REQUEST_ID"

# =======================================================================
#  RINGKASAN
# =======================================================================
RINA2_LINE="(tidak tersedia — skenario not_selected dilewati)"
[ -n "$RINA2" ] && RINA2_LINE="$RINA2"

cat <<EOF

${BLD}============ TOKEN & ID UNTUK UJI WEBSOCKET ============${RST}

# --- TOKEN (dipakai sebagai TOKEN=... saat menjalankan ws-actor.mjs) ---
TOKEN_BUDI   = $BUDI
TOKEN_CAHYA  = $CAHYA
TOKEN_RINA   = $RINA
TOKEN_RINA2  = $RINA2_LINE
TOKEN_ADMIN  = $ADMIN

# --- ID ---
budiUserId   = $BUDI_ID
rinaUserId   = $RINA_ID
SESSION_ID   = $SESSION_ID
REQUEST_ID   = $REQUEST_ID
TEST_COORD   = [$TEST_LNG, $TEST_LAT]

${BLD}=======================================================${RST}

Langkah berikut: ikuti docs/testing-websocket.md.
Contoh buka terminal aktor (dari folder backend/):
  TOKEN=$BUDI LABEL=budi node scripts/manual-tests/ws-actor.mjs

Catatan:
- Token berumur ~6 jam (ACCESS_TOKEN_TTL). Jalankan ulang skrip bila kedaluwarsa.
- SESSION_ID bisa jadi 'completed' kalau kamu akhiri sesi; buat ulang via skrip bila perlu.

EOF
