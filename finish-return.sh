#!/usr/bin/env bash
set -euo pipefail
BASE="${BASE:-http://localhost:3000/api}"; PASS="${PASS:-password123}"; J='Content-Type: application/json'
tok() { curl -sS -X POST "$BASE/auth/login" -H "$J" -d "{\"username\":\"$1\",\"password\":\"$PASS\"}" | jq -r .accessToken; }
OPS=$(tok operasional); FIN=$(tok keuangan)
PNG=$(mktemp --suffix=.png); trap 'rm -f "$PNG"' EXIT
printf '\x89PNG\r\n\x1a\n' > "$PNG"; head -c 64 /dev/zero >> "$PNG"

ID=$(curl -sS "$BASE/cash-advances?status=REPORT_APPROVED" -H "Authorization: Bearer $OPS" | jq -r '.data[0].id')
echo "Pengajuan: $ID"
BAL=$(curl -sS "$BASE/cash-advances/$ID" -H "Authorization: Bearer $OPS" | jq -r '.settlement.outstanding | tonumber')
echo "Sisa: $BAL"

RET=$(curl -sS -X POST "$BASE/advance-returns" -H "Authorization: Bearer $OPS" -H "$J" \
  -d "$(jq -n --arg id "$ID" --arg d "$(date +%F)" --argjson a "$BAL" '{returnDate:$d, returnedBy:"Andi Operasional", items:[{cashAdvanceId:$id, amount:$a}]}')")
echo "$RET" | jq '{number,direction,status}'
RID=$(echo "$RET" | jq -r .id)

curl -sS -X POST "$BASE/attachments" -H "Authorization: Bearer $OPS" \
  -F ownerType=ADVANCE_RETURN -F "ownerId=$RID" -F kind=TRANSFER_PROOF -F "file=@$PNG;type=image/png" | jq '{id,kind}'
curl -sS -X POST "$BASE/advance-returns/$RID/receive" -H "Authorization: Bearer $FIN" -H "$J" -d '{}' | jq '{number,status}'
curl -sS "$BASE/cash-advances/$ID" -H "Authorization: Bearer $OPS" | jq '{number,status}'
