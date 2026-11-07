function sum(rows, key) {
  return rows.reduce((total, row) => total + row[key], 0);
}

function indexByCoupon(rows, label) {
  const map = new Map();
  for (const row of rows) {
    if (!row.couponId) throw new Error(`${label}에 쿠폰 번호가 없는 줄이 있습니다.`);
    if (map.has(row.couponId)) throw new Error(`${label}에 쿠폰 번호 ${row.couponId}가 두 번 있습니다.`);
    map.set(row.couponId, row);
  }
  return map;
}

export function reconcile(settlement, internalRecords, settlementDate) {
  const settlementMap = indexByCoupon(settlement, "쿠폰 정산 자료");
  const internalMap = indexByCoupon(internalRecords, "내부 자료");
  const matched = [];
  const amountMismatches = [];
  const countMismatches = [];
  const missingInInternal = [];
  const missingInSettlement = [];

  for (const row of settlement) {
    const other = internalMap.get(row.couponId);
    if (!other) {
      missingInInternal.push(row);
      continue;
    }
    const sameAmount = row.amount === other.amount;
    const sameCount = row.count === other.count;
    if (sameAmount && sameCount) {
      matched.push({
        couponId: row.couponId,
        store: row.store,
        count: row.count,
        amount: row.amount,
      });
      continue;
    }
    if (!sameAmount) {
      amountMismatches.push({
        couponId: row.couponId,
        store: row.store,
        settlementAmount: row.amount,
        internalAmount: other.amount,
        difference: row.amount - other.amount,
      });
    }
    if (!sameCount) {
      countMismatches.push({
        couponId: row.couponId,
        store: row.store,
        settlementCount: row.count,
        internalCount: other.count,
        difference: row.count - other.count,
      });
    }
  }

  for (const row of internalRecords) {
    if (!settlementMap.has(row.couponId)) missingInSettlement.push(row);
  }

  const matchedAmount = sum(matched, "amount");
  const invoice = {
    invoiceNo: `INV-${settlementDate.replaceAll("-", "")}-001`,
    date: settlementDate,
    buyer: "샘플 가맹점",
    lines: matched.map((row) => ({
      couponId: row.couponId,
      description: `${row.store} 쿠폰 정산`,
      count: row.count,
      amount: row.amount,
    })),
    totalAmount: matchedAmount,
  };
  const voucher = {
    voucherNo: `JV-${settlementDate.replaceAll("-", "")}-001`,
    date: settlementDate,
    memo: "쿠폰 정산 일치분",
    lines: [
      { side: "차변", account: "미수금", amount: matchedAmount },
      { side: "대변", account: "매출", amount: matchedAmount },
    ],
  };

  return {
    settlementCount: settlement.length,
    internalCount: internalRecords.length,
    countDifference: settlement.length - internalRecords.length,
    settlementQuantity: sum(settlement, "count"),
    internalQuantity: sum(internalRecords, "count"),
    quantityDifference: sum(settlement, "count") - sum(internalRecords, "count"),
    settlementAmount: sum(settlement, "amount"),
    internalAmount: sum(internalRecords, "amount"),
    amountDifference: sum(settlement, "amount") - sum(internalRecords, "amount"),
    matched,
    amountMismatches,
    countMismatches,
    missingInInternal,
    missingInSettlement,
    invoice,
    voucher,
  };
}
