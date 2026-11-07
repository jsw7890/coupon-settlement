import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { reconcile } from "../src/reconcile.mjs";
import { internalRecords, settlement, settlementDate } from "../src/sample.mjs";

const result = reconcile(settlement, internalRecords, settlementDate);

describe("샘플 쿠폰 정산 대조", () => {
  test("자료 건수와 수량 차이를 보여 준다", () => {
    assert.equal(result.settlementCount, 5);
    assert.equal(result.internalCount, 5);
    assert.equal(result.countDifference, 0);
    assert.equal(result.settlementQuantity, 11);
    assert.equal(result.internalQuantity, 9);
    assert.equal(result.quantityDifference, 2);
  });

  test("금액 합계 차이를 보여 준다", () => {
    assert.equal(result.settlementAmount, 110000);
    assert.equal(result.internalAmount, 114000);
    assert.equal(result.amountDifference, -4000);
  });

  test("한쪽에만 있는 쿠폰을 누락으로 보여 준다", () => {
    assert.deepEqual(result.missingInInternal.map((row) => row.couponId), ["C-1004"]);
    assert.deepEqual(result.missingInSettlement.map((row) => row.couponId), ["C-1006"]);
  });

  test("금액이 다른 줄과 수량이 다른 줄을 나눠 보여 준다", () => {
    assert.equal(result.amountMismatches.length, 1);
    assert.equal(result.amountMismatches[0].couponId, "C-1003");
    assert.equal(result.amountMismatches[0].difference, -3000);
    assert.equal(result.countMismatches.length, 1);
    assert.equal(result.countMismatches[0].couponId, "C-1005");
    assert.equal(result.countMismatches[0].difference, 2);
  });

  test("금액과 수량이 같은 건만 인보이스와 전표로 만든다", () => {
    assert.deepEqual(result.matched.map((row) => row.couponId), ["C-1001", "C-1002"]);
    assert.equal(result.invoice.totalAmount, 35000);
    assert.equal(result.invoice.lines.length, 2);
    assert.deepEqual(result.voucher.lines.map((line) => line.amount), [35000, 35000]);
    assert.equal(result.voucher.lines[0].side, "차변");
    assert.equal(result.voucher.lines[1].side, "대변");
  });
});
