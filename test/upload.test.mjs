import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";
import { reconcile } from "../src/reconcile.mjs";
import { internalRecords, settlement, settlementDate } from "../src/sample.mjs";
import { readTable, reconcileUploads } from "../src/parse-sheet.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStored(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const data = Buffer.from(file.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, data);
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt32LE(crc32(data), 16);
    header.writeUInt32LE(data.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt32LE(offset, 42);
    central.push(header, name);
    offset += local.length + name.length + data.length;
  }
  const centralStart = offset;
  const centralBody = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBody.length, 12);
  end.writeUInt32LE(centralStart, 16);
  return Buffer.concat([...parts, centralBody, end]);
}

function sheetXml(rows) {
  const body = rows.map((row, rowIndex) => {
    const cells = row.map((value, column) => {
      const ref = `${String.fromCharCode(65 + column)}${rowIndex + 1}`;
      return `<c r="${ref}" t="inlineStr"><is><t>${value}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

describe("업체 전달 샘플 파일 업로드", () => {
  test("csv 두 개를 올리면 기존 샘플 대조와 같다", () => {
    const uploaded = reconcileUploads({
      settlementBuffer: readFileSync(path.join(root, "업체전달샘플_쿠폰사_정산내역.csv")),
      settlementName: "업체전달샘플_쿠폰사_정산내역.csv",
      internalBuffer: readFileSync(path.join(root, "업체전달샘플_가맹점_내부자료.csv")),
      internalName: "업체전달샘플_가맹점_내부자료.csv",
    });
    const expected = reconcile(settlement, internalRecords, settlementDate);
    assert.equal(uploaded.settlementDate, settlementDate);
    assert.deepEqual(uploaded.settlement, settlement);
    assert.deepEqual(uploaded.internalRecords, internalRecords);
    assert.deepEqual(uploaded.result, expected);
  });

  test("같은 내용의 xlsx도 읽는다", () => {
    const settlementFile = zipStored([{
      name: "xl/worksheets/sheet1.xml",
      data: sheetXml([
        ["정산일", "쿠폰번호", "매장명", "사용수량", "정산금액"],
        ["2026-11-06", "C-1001", "강남점", "2", "20000"],
      ]),
    }]);
    const internalFile = zipStored([{
      name: "xl/worksheets/sheet1.xml",
      data: sheetXml([
        ["매출일", "쿠폰번호", "매장명", "판매수량", "매출금액"],
        ["2026-11-06", "C-1001", "강남점", "2", "20000"],
      ]),
    }]);
    const table = readTable(settlementFile, "정산.xlsx");
    assert.deepEqual(table.rows, [{ couponId: "C-1001", store: "강남점", count: 2, amount: 20000 }]);
    const uploaded = reconcileUploads({
      settlementBuffer: settlementFile,
      settlementName: "정산.xlsx",
      internalBuffer: internalFile,
      internalName: "내부.xlsx",
    });
    assert.equal(uploaded.result.invoice.totalAmount, 20000);
    assert.equal(uploaded.result.missingInInternal.length, 0);
  });
});

describe("첫 화면", () => {
  test("업로드 칸과 버튼만 있고 기본 대조 결과는 없다", () => {
    const html = readFileSync(path.join(root, "public", "index.html"), "utf8");
    const script = readFileSync(path.join(root, "public", "app.js"), "utf8");
    assert.match(html, /id="settlement-file"/);
    assert.match(html, /id="internal-file"/);
    assert.match(html, /올린 파일로 대조/);
    assert.doesNotMatch(html, /C-100[1-6]|35,000|INV-|JV-/);
    assert.doesNotMatch(script, /\/api\/sample/);
    assert.doesNotMatch(script, /\brun\(\)/);
  });
});
