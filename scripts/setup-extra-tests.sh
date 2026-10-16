#!/usr/bin/env bash
#
# setup-extra-tests.sh — Siapkan semua PRASYARAT untuk docs/testing-extra-endpoints.md
#
# Mengerjakan prasyarat lewat curl, lalu mencetak semua ID yang perlu disimpan.
# Asumsi (sesuai info kamu): BUDI, RINA, ADMIN SUDAH terdaftar + terverifikasi,
# jadi skrip cukup LOGIN (tanpa OTP). Hanya DEWI (uji resend-otp) yang didaftar
# baru di sini dan sengaja TIDAK diverifikasi.
#
# Satu-satunya langkah interaktif: tidak ada untuk alur utama. (Dewi tidak perlu
# OTP karena uji resend justru butuh akun yang belum terverifikasi.)
#
# Prasyarat:
#   - backend jalan di $BASE (default http://localhost:4000) -> `npm run dev` di backend/
#   - `jq` terpasang
#   - ADMIN sudah ber-role 'admin' di DB (kamu bilang sudah terdaftar; pastikan role-nya admin)
#
# Jalankan dari mana saja:
#   bash scripts/setup-extra-tests.sh
#
set -euo pipefail

BASE="${BASE:-http://localhost:4000}"
PASSWORD="${PASSWORD:-Rahasia123!}"

# Nomor aktor (samakan dengan docs)
PHONE_BUDI="081200000001"
PHONE_RINA="081200000003"
PHONE_ADMIN="081200000009"
PHONE_DEWI="081200000055"

# ---------- util ----------
RED=$'\e[31m'; GRN=$'\e[32m'; YLW=$'\e[33m'; BLU=$'\e[34m'; BLD=$'\e[1m'; RST=$'\e[0m'
info() { printf '%s[*]%s %s\n' "$BLU" "$RST" "$*"; }
ok()   { printf '%s[OK]%s %s\n' "$GRN" "$RST" "$*"; }
warn() { printf '%s[!]%s %s\n' "$YLW" "$RST" "$*"; }
die()  { printf '%s[x]%s %s\n' "$RED" "$RST" "$*" >&2; exit 1; }

command -v jq >/dev/null 2>&1 || die "jq tidak ditemukan. Pasang dulu: sudo apt install jq"

# Cek backend hidup
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/health" || true)
[ "$code" = "200" ] || die "Backend tidak merespons 200 di $BASE/health (dapat: ${code:-kosong}). Jalankan 'npm run dev' di backend/ dulu."
ok "Backend hidup di $BASE"

# login <phone> -> echo accessToken (stdout). Gagal -> die dgn pesan error server.
login() {
  local phone="$1" resp token
  resp=$(curl -s -X POST "$BASE/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"phoneNumber\":\"$phone\",\"password\":\"$PASSWORD\"}")
  token=$(echo "$resp" | jq -r '.data.accessToken // empty')
  if [ -z "$token" ]; then
    die "Login $phone gagal: $(echo "$resp" | jq -c '.error // .')"
  fi
  echo "$token"
}

# ---------- 1. LOGIN semua aktor ----------
info "Login BUDI, RINA, ADMIN ..."
BUDI=$(login "$PHONE_BUDI")
RINA_RESP=$(curl -s -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d "{\"phoneNumber\":\"$PHONE_RINA\",\"password\":\"$PASSWORD\"}")
RINA=$(echo "$RINA_RESP" | jq -r '.data.accessToken // empty')
RINA_ID=$(echo "$RINA_RESP" | jq -r '.data.user.id // empty')
[ -n "$RINA" ] || die "Login RINA gagal: $(echo "$RINA_RESP" | jq -c '.error // .')"
ADMIN=$(login "$PHONE_ADMIN")
ok "Token BUDI/RINA/ADMIN didapat. rinaUserId=$RINA_ID"

# Pastikan ADMIN benar-benar role admin (uji 2 & 5 butuh ini)
ADMIN_ROLE=$(curl -s "$BASE/api/users/me" -H "Authorization: Bearer $ADMIN" | jq -r '.data.role // empty')
if [ "$ADMIN_ROLE" != "admin" ]; then
  warn "Role ADMIN saat ini '$ADMIN_ROLE', bukan 'admin'."
  warn "Jalankan di DB:  UPDATE users SET role='admin' WHERE phone_number='$PHONE_ADMIN';  lalu ulangi skrip."
  die "Berhenti: uji reject (#2) & delete node (#5) butuh role admin."
fi
ok "ADMIN ber-role admin."

# ---------- 2. Pastikan RINA relawan terverifikasi (idempoten) ----------
info "Cek status relawan RINA ..."
RINA_ME=$(curl -s "$BASE/api/volunteers/me" -H "Authorization: Bearer $RINA")
RINA_VSTATUS=$(echo "$RINA_ME" | jq -r '.data.verificationStatus // empty')
RINA_CANMAP=$(echo "$RINA_ME" | jq -r '.data.canMapData // false')

if [ "$RINA_VSTATUS" != "verified" ]; then
  info "RINA belum verified (status='$RINA_VSTATUS'). Apply + verifikasi via ADMIN ..."
  # apply (abaikan error kalau sudah pernah apply)
  curl -s -X POST "$BASE/api/volunteers/apply" \
    -H "Authorization: Bearer $RINA" -H "Content-Type: application/json" \
    -d '{"motivation":"Ingin membantu teman difabel di FT & FMIPA.","idCardUrl":"https://cdn.ugm.ac.id/ktm/rina.jpg","serviceAreaNote":"Sekitar FT & FMIPA UGM"}' >/dev/null || true
  VRESP=$(curl -s -X PATCH "$BASE/api/volunteers/$RINA_ID/verification" \
    -H "Authorization: Bearer $ADMIN" -H "Content-Type: application/json" \
    -d '{"verificationStatus":"verified","canCompanion":true,"canMapData":true}')
  echo "$VRESP" | jq -e '.success == true' >/dev/null \
    || die "Verifikasi RINA gagal: $(echo "$VRESP" | jq -c '.error // .')"
  ok "RINA diverifikasi (canCompanion + canMapData)."
else
  ok "RINA sudah verified (canMapData=$RINA_CANMAP)."
fi

# ---------- 3. buildingId (publik) ----------
info "Ambil buildingId ..."
BUILDING_ID=$(curl -s "$BASE/api/buildings?faculty=Fakultas%20Teknik" | jq -r '.data[0].id // empty')
[ -n "$BUILDING_ID" ] || die "Tidak ada gedung. Jalankan seed dev (graph.dev.seed) dulu."
ok "buildingId=$BUILDING_ID"

# =======================================================================
#  PRASYARAT PER UJI
# =======================================================================

# ---------- UJI 1: SESSION_ID (BUDI) ----------
info "[Uji 1] Mulai sesi travel BUDI ..."
SESSION_ID=$(curl -s -X POST "$BASE/api/sessions/start" \
  -H "Authorization: Bearer $BUDI" -H "Content-Type: application/json" \
  -d '{"origin":{"type":"Point","coordinates":[110.3718,-7.7655]},"destination":{"type":"Point","coordinates":[110.3740,-7.7662]},"destinationName":"Pintu GIK","profileId":"wheelchair"}' \
  | jq -r '.data.id // empty')
[ -n "$SESSION_ID" ] || die "Gagal membuat sesi (uji 1)."
ok "SESSION_ID=$SESSION_ID"

# ---------- UJI 2: DRAFT_NODE_ID (RINA -> draft) ----------
info "[Uji 2] RINA buat node draft untuk di-reject ..."
DRAFT_RESP=$(curl -s -X POST "$BASE/api/graph/nodes" \
  -H "Authorization: Bearer $RINA" -H "Content-Type: application/json" \
  -d "{\"nodeType\":\"ramp\",\"name\":\"Ramp usulan RINA (uji reject)\",\"buildingId\":\"$BUILDING_ID\",\"floorLevel\":0,\"location\":{\"type\":\"Point\",\"coordinates\":[110.3726,-7.7656]},\"surveyedAt\":\"2026-10-01T09:30:00+07:00\"}")
DRAFT_NODE_ID=$(echo "$DRAFT_RESP" | jq -r '.data.id // empty')
[ -n "$DRAFT_NODE_ID" ] || die "Gagal membuat draft node (uji 2): $(echo "$DRAFT_RESP" | jq -c '.error // .')"
ok "DRAFT_NODE_ID=$DRAFT_NODE_ID  (pakai di URL: /verification/node:$DRAFT_NODE_ID/reject)"

# ---------- UJI 3: CONVERSATION_ID (BUDI) ----------
info "[Uji 3] Mulai percakapan AI planner BUDI ..."
CONVERSATION_ID=$(curl -s -X POST "$BASE/api/ai-planner/conversations" \
  -H "Authorization: Bearer $BUDI" -H "Content-Type: application/json" \
  -d '{}' | jq -r '.data.id // empty')
[ -n "$CONVERSATION_ID" ] || die "Gagal membuat percakapan (uji 3)."
ok "CONVERSATION_ID=$CONVERSATION_ID"

# ---------- UJI 4: DEWI (register, JANGAN verify) ----------
info "[Uji 4] Daftarkan DEWI (nomor belum terverifikasi, untuk resend-otp) ..."
DEWI_RESP=$(curl -s -X POST "$BASE/api/auth/register" -H "Content-Type: application/json" \
  -d "{\"phoneNumber\":\"$PHONE_DEWI\",\"name\":\"Dewi Uji Resend\",\"role\":\"mobility_user\",\"password\":\"$PASSWORD\"}")
if echo "$DEWI_RESP" | jq -e '.success == true' >/dev/null 2>&1; then
  ok "DEWI terdaftar (belum diverifikasi). phoneNumber=$PHONE_DEWI"
else
  DEWI_CODE=$(echo "$DEWI_RESP" | jq -r '.error.code // empty')
  if [ "$DEWI_CODE" = "CONFLICT" ]; then
    warn "DEWI ($PHONE_DEWI) sudah terdaftar sebelumnya."
    warn "Kalau sudah terlanjur TERVERIFIKASI, resend-otp akan balas 409. Ganti PHONE_DEWI ke nomor lain yang belum dipakai bila perlu."
  else
    warn "Register DEWI tidak sukses: $(echo "$DEWI_RESP" | jq -c '.error // .')"
  fi
fi

# ---------- UJI 5: NODE_ID (ADMIN membuat node untuk dihapus) ----------
info "[Uji 5] ADMIN buat node sementara untuk di-DELETE ..."
NODE_RESP=$(curl -s -X POST "$BASE/api/graph/nodes" \
  -H "Authorization: Bearer $ADMIN" -H "Content-Type: application/json" \
  -d "{\"nodeType\":\"ramp\",\"name\":\"Node sementara untuk uji DELETE\",\"buildingId\":\"$BUILDING_ID\",\"floorLevel\":0,\"location\":{\"type\":\"Point\",\"coordinates\":[110.3727,-7.7657]},\"surveyedAt\":\"2026-10-01T09:30:00+07:00\"}")
NODE_ID=$(echo "$NODE_RESP" | jq -r '.data.id // empty')
[ -n "$NODE_ID" ] || die "Gagal membuat node (uji 5): $(echo "$NODE_RESP" | jq -c '.error // .')"
ok "NODE_ID=$NODE_ID"

# ---------- UJI 6: REQUEST_ID (BUDI buat companion request) ----------
info "[Uji 6] BUDI buat permintaan pendampingan ..."
REQ_RESP=$(curl -s -X POST "$BASE/api/companions/requests" \
  -H "Authorization: Bearer $BUDI" -H "Content-Type: application/json" \
  -d '{"destinationName":"Seminar di GIK Lantai 2","destinationLocation":{"type":"Point","coordinates":[110.3740,-7.7662]},"meetingPointLocation":{"type":"Point","coordinates":[110.3718,-7.7655]},"meetingPointNote":"Depan gerbang utama FT","scheduledStart":"2026-12-20T09:00:00+07:00","estimatedDurationMin":120,"assistanceTypes":["memandu_jalan","bantu_kursi_roda"],"notes":"Saya pakai kursi roda manual."}')
REQUEST_ID=$(echo "$REQ_RESP" | jq -r '.data.id // empty')
[ -n "$REQUEST_ID" ] || die "Gagal membuat companion request (uji 6): $(echo "$REQ_RESP" | jq -c '.error // .')"
ok "REQUEST_ID=$REQUEST_ID"

# =======================================================================
#  RINGKASAN — SIMPAN NILAI INI
# =======================================================================
cat <<EOF

${BLD}================= ID & TOKEN UNTUK PENGUJIAN =================${RST}

# --- TOKEN (Authorization: Bearer ...) ---
accessToken_budi   = $BUDI
accessToken_rina   = $RINA
accessToken_admin  = $ADMIN
rinaUserId         = $RINA_ID

# --- ID PER UJI ---
buildingId         = $BUILDING_ID
SESSION_ID         = $SESSION_ID        # Uji 1  PATCH /sessions/:id/location
DRAFT_NODE_ID      = $DRAFT_NODE_ID     # Uji 2  POST /verification/node:<id>/reject
CONVERSATION_ID    = $CONVERSATION_ID   # Uji 3  GET  /ai-planner/conversations/:id
DEWI phoneNumber   = $PHONE_DEWI        # Uji 4  POST /auth/resend-otp
NODE_ID            = $NODE_ID           # Uji 5  DELETE /graph/nodes/:id
REQUEST_ID         = $REQUEST_ID        # Uji 6  POST /companions/requests/:id/cancel

${BLD}=============================================================${RST}

Catatan:
- Token access berumur pendek. Kalau keburu kedaluwarsa, jalankan ulang skrip
  (idempoten) atau login ulang aktor terkait.
- DRAFT_NODE_ID & NODE_ID adalah ID node graf (BigInt sebagai string).
- Uji 2 URL lengkap: $BASE/api/verification/node:$DRAFT_NODE_ID/reject

EOF
