#!/usr/bin/env bash
set -euo pipefail
BASE="${BASE:-http://localhost:3000/api}"
PASS="${PASS:-password123}"
J='Content-Type: application/json'

tok() {
  curl -sS -X POST "$BASE/auth/login" -H "$J" \
    -d "{\"username\":\"$1\",\"password\":\"$PASS\"}" | jq -r .accessToken
}
CHK=$(tok checker)
DIR=$(tok direktur)

WO=$(curl -sS "$BASE/work-orders" -H "Authorization: Bearer $CHK" \
  | jq -r '.. | objects | select(.number? == "WO-DEMO-001") | .id' | head -1)
echo "WO=$WO"

echo "== Checker mengecek biaya"
curl -sS -X POST "$BASE/work-orders/$WO/cost/check" \
  -H "Authorization: Bearer $CHK" -H "$J" -d '{}' | jq '{number,status,message}'

echo "== Direktur menyetujui biaya"
curl -sS -X POST "$BASE/work-orders/$WO/cost/approve" \
  -H "Authorization: Bearer $DIR" -H "$J" -d '{}' | jq '{number,status,message}'
