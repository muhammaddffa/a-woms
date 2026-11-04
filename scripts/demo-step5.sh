#!/usr/bin/env bash
# Demo Step 5 dengan curl: uang jalan dari pengajuan sampai SETTLED.
# Prasyarat: server berjalan, seed sudah dijalankan, WO-DEMO-001 sudah COST_APPROVED
# (cek oleh checker, setujui oleh direktur). Butuh: curl dan jq.
# Dijalankan sekali per database; untuk mengulang: npx prisma migrate reset --force lalu seed dan setujui biaya WO lagi.
#   BASE=http://localhost:3000/api PASS=password123 bash scripts/demo-step5.sh
set -euo pipefail
BASE="${BASE:-http://localhost:3000/api}"
PASS="${PASS:-password123}"
declare -A T

step() { printf '\n== %s\n' "$*"; }
api() { # api USER METHOD PATH [JSON]
  local u=$1 m=$2 p=$3 b=${4:-} out code body
  if [ -n "$b" ]; then
    out=$(curl -sS -w '\n%{http_code}' -X "$m" "$BASE$p" -H "Authorization: Bearer ${T[$u]}" -H 'Content-Type: application/json' -d "$b")
  else
    out=$(curl -sS -w '\n%{http_code}' -X "$m" "$BASE$p" -H "Authorization: Bearer ${T[$u]}")
  fi
  code=${out##*$'\n'}; body=${out%$'\n'*}
  if [ "$code" -ge 400 ]; then echo "GAGAL ($code): $m $p" >&2; echo "$body" | jq . >&2 || echo "$body" >&2; exit 1; fi
  printf '%s' "$body"
}
upload() { # upload USER OWNER_TYPE OWNER_ID KIND
  local out code body
  out=$(curl -sS -w '\n%{http_code}' -X POST "$BASE/attachments" -H "Authorization: Bearer ${T[$1]}" \
        -F "ownerType=$2" -F "ownerId=$3" -F "kind=$4" -F "file=@$PNG;type=image/png")
  code=${out##*$'\n'}; body=${out%$'\n'*}
  if [ "$code" -ge 400 ]; then echo "GAGAL unggah ($code)" >&2; echo "$body" | jq . >&2; exit 1; fi
  printf '%s' "$body" | jq -r '.id'
}
show() { jq -r '"   status: \(.status)"'; }

PNG=$(mktemp --suffix=.png); trap 'rm -f "$PNG"' EXIT
printf '\x89PNG\r\n\x1a\n' > "$PNG"; head -c 64 /dev/zero >> "$PNG"

step "1. Login (operasional, checker, direktur, keuangan)"
for u in operasional checker direktur keuangan; do
  T[$u]=$(curl -sS -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -d "{\"username\":\"$u\",\"password\":\"$PASS\"}" | jq -r '.accessToken')
  [ -n "${T[$u]}" ] && [ "${T[$u]}" != null ] || { echo "Login $u gagal"; exit 1; }
done

step "2. Ambil WO-DEMO-001, biaya rencana item 1, rekening, dan jenis biaya"
WO=$(api operasional GET "/work-orders" | jq -r '.. | objects | select(.number? == "WO-DEMO-001") | .id' | head -1)
PCOSTS=$(api operasional GET "/work-orders/$WO/planned-costs")
pc() { echo "$PCOSTS" | jq -r --arg c "$1" '.data[] | select(.chargeType.code==$c and .workOrderItem.lineNo==1) | .id'; }
ACC=$(api keuangan GET "/cash-accounts" | jq -r '[.. | objects | select(.code? == "BANK")][0].id')
MEALS=$(api operasional GET "/charge-types" | jq -r '[.. | objects | select(.code? == "MEALS")][0].id')
ITEM1=$(echo "$PCOSTS" | jq -r '.data[] | select(.workOrderItem.lineNo==1) | .workOrderItemId' | head -1)
echo "   WO=$WO"

step "2b. Pastikan biaya WO sudah disetujui (otomatis, dilewati bila sudah)"
WOST=$(api operasional GET "/work-orders" | jq -r '.. | objects | select(.number? == "WO-DEMO-001") | .status' | head -1)
echo "   status WO saat ini: $WOST"
if [ "$WOST" = "OPEN" ]; then
  api checker POST "/work-orders/$WO/cost/check" '{}' | jq -r '"   dicek -> \(.status)"'
  api direktur POST "/work-orders/$WO/cost/approve" '{}' | jq -r '"   disetujui -> \(.status)"'
elif [ "$WOST" = "COST_CHECKED" ]; then
  api direktur POST "/work-orders/$WO/cost/approve" '{}' | jq -r '"   disetujui -> \(.status)"'
fi

step "3. Operasional mengajukan uang jalan (BBM 600rb, Tol 250rb, Retribusi 50rb, Konsumsi 100rb)"
BODY=$(jq -n --arg wo "$WO" --arg f "$(pc FUEL)" --arg t "$(pc TOLL)" --arg l "$(pc LEVY)" --arg m "$(pc MEALS)" --arg d "$(date +%F)" \
  '{workOrderId:$wo, advanceType:"DRIVER_ALLOWANCE", advanceDate:$d, recipient:"Supir Satu",
    items:[{plannedCostId:$f,advanceAmount:600000},{plannedCostId:$t,advanceAmount:250000},{plannedCostId:$l,advanceAmount:50000},{plannedCostId:$m,advanceAmount:100000}]}')
CA=$(api operasional POST /cash-advances "$BODY")
ID=$(echo "$CA" | jq -r .id); echo "   nomor: $(echo "$CA" | jq -r .number)"; echo "$CA" | show
echo "   langkah yang berlaku: $(echo "$CA" | jq -c .requiredSteps)"

step "4. Checker mengecek, Direktur menyetujui"
api checker POST "/cash-advances/$ID/check" '{}' | show
api direktur POST "/cash-advances/$ID/approve" '{}' | show

step "5. Keuangan mengunggah bukti transfer, lalu mencairkan"
upload keuangan CASH_ADVANCE "$ID" TRANSFER_PROOF >/dev/null
api keuangan POST "/cash-advances/$ID/pay" "{\"cashAccountId\":\"$ACC\",\"transferFee\":6500}" | show

step "6. Checker memverifikasi transfer (LPJ baru boleh dibuat setelah ini)"
api checker POST "/cash-advances/$ID/verify-transfer" '{}' | show

step "7. Operasional mengisi realisasi + bukti bon + biaya di luar rencana"
DETAIL=$(api operasional GET "/cash-advances/$ID")
ACT=$(echo "$DETAIL" | jq -c '[.items[] | {itemId:.id, actualAmount:(if .plannedCost.chargeType.code=="FUEL" then 550000 elif .plannedCost.chargeType.code=="TOLL" then 250000 elif .plannedCost.chargeType.code=="LEVY" then 50000 else 80000 end)}]')
api operasional PUT "/cash-advances/$ID/report/actuals" "{\"items\":$ACT}" >/dev/null
for iid in $(echo "$DETAIL" | jq -r '.items[].id'); do upload operasional CASH_ADVANCE_ITEM "$iid" RECEIPT >/dev/null; done
EX=$(api operasional POST "/cash-advances/$ID/extra-costs" "{\"workOrderItemId\":\"$ITEM1\",\"chargeTypeId\":\"$MEALS\",\"description\":\"Parkir dan makan tambahan\",\"amount\":15000}")
upload operasional CASH_ADVANCE_EXTRA_COST "$(echo "$EX" | jq -r '.extraCosts[0].id')" RECEIPT >/dev/null
echo "   dokumen yang masih kurang: $(api operasional GET "/cash-advances/$ID" | jq -c .missingDocuments)"

step "8. Ajukan LPJ -> Checker periksa -> Direktur setujui"
api operasional POST "/cash-advances/$ID/report/submit" | show
api checker POST "/cash-advances/$ID/report/check" '{}' | show
FINAL=$(api direktur POST "/cash-advances/$ID/report/approve" '{}')
echo "$FINAL" | show
echo "$FINAL" | jq -r '.settlement | "   selisih: \(.balance) (\(.direction)), sisa yang harus diselesaikan: \(.outstanding)"'

step "9. Tagihan ke pabrik terbentuk dari realisasi (jenis biaya AT_COST)"
api direktur GET "/work-orders/$WO/billable-charges" | jq -c '.data // . | if type=="array" then map({biaya:(.chargeType.code // .chargeTypeId), total:.totalPrice}) else . end'

step "10. Operasional mengembalikan sisa, Keuangan mengonfirmasi"
BAL=$(echo "$FINAL" | jq -r '.settlement.outstanding | tonumber')
RET=$(api operasional POST /advance-returns "$(jq -n --arg id "$ID" --arg d "$(date +%F)" --argjson a "$BAL" '{returnDate:$d, returnedBy:"Andi Operasional", items:[{cashAdvanceId:$id, amount:$a}]}')")
RID=$(echo "$RET" | jq -r .id); echo "   nomor: $(echo "$RET" | jq -r .number)  arah: $(echo "$RET" | jq -r .direction)"
upload operasional ADVANCE_RETURN "$RID" TRANSFER_PROOF >/dev/null
api keuangan POST "/advance-returns/$RID/receive" '{}' | show

step "11. Hasil akhir dan riwayat persetujuan"
api operasional GET "/cash-advances/$ID" | jq -r '"   pengajuan \(.number): \(.status)"'
api operasional GET "/cash-advances/$ID/history" | jq -r '.[] | "   \(.step) oleh \(.actor.fullName)"'
echo; echo "Selesai: seluruh alur lolos."
