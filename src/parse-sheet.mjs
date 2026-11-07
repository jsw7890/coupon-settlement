import { inflateRawSync } from "node:zlib";
import { reconcile } from "./reconcile.mjs";

const HEADER = {
  couponId: ["쿠폰번호", "쿠폰", "couponid"],
  store: ["매장명", "매장", "store"],
  count: ["사용수량", "판매수량", "수량", "count"],
  amount: ["정산금액", "매출금액", "금액", "amount"],
  date: ["정산일", "매출일", "일자", "date"],
};

function decodeXml(text) {
  return text
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

export function parseCsv(text) {
  const source = text.replace(/^\uFEFF/, "").replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else quoted = false;
      } else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((item) => item.some((value) => value.trim() !== ""));
}

function unzip(buffer) {
  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const files = new Map();
  let offset = 0;
  while (offset + 30 <= data.length) {
    const signature = data.readUInt32LE(offset);
    if (signature !== 0x04034b50) break;
    const flags = data.readUInt16LE(offset + 6);
    const method = data.readUInt16LE(offset + 8);
    const compressedSize = data.readUInt32LE(offset + 18);
    const nameLength = data.readUInt16LE(offset + 26);
    const extraLength = data.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = data.toString("utf8", nameStart, nameStart + nameLength);
    const dataStart = nameStart + nameLength + extraLength;
    if (flags & 0x8) throw new Error("이 엑셀 파일은 다시 .xlsx로 저장한 뒤 올려 주세요.");
    const compressed = data.subarray(dataStart, dataStart + compressedSize);
    const content = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : null;
    if (!content) throw new Error("이 엑셀 압축은 읽지 못했습니다.");
    files.set(name, content);
    offset = dataStart + compressedSize;
  }
  if (files.size === 0) throw new Error("엑셀 파일을 읽지 못했습니다.");
  return files;
}

function columnIndex(letters) {
  let index = 0;
  for (const char of letters) index = index * 26 + char.charCodeAt(0) - 64;
  return index - 1;
}

function sharedStrings(xml) {
  const values = [];
  for (const item of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    values.push([...item[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((part) => decodeXml(part[1])).join(""));
  }
  return values;
}

function parseXlsx(buffer) {
  const files = unzip(buffer);
  const sheetName = [...files.keys()].find((name) => /xl\/worksheets\/sheet\d+\.xml$/.test(name));
  if (!sheetName) throw new Error("엑셀 시트를 찾지 못했습니다.");
  const strings = files.has("xl/sharedStrings.xml")
    ? sharedStrings(files.get("xl/sharedStrings.xml").toString("utf8"))
    : [];
  const xml = files.get(sheetName).toString("utf8");
  const rows = new Map();
  for (const cell of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = cell[1];
    const inner = cell[2] ?? "";
    const ref = /r="([A-Z]+)(\d+)"/.exec(attrs);
    if (!ref) continue;
    const type = /t="([^"]+)"/.exec(attrs)?.[1] ?? "";
    let value = "";
    if (type === "inlineStr") {
      value = [...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((part) => decodeXml(part[1])).join("");
    } else {
      const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "";
      value = type === "s" ? strings[Number(raw)] ?? "" : decodeXml(raw);
    }
    const rowNumber = Number(ref[2]);
    if (!rows.has(rowNumber)) rows.set(rowNumber, []);
    rows.get(rowNumber)[columnIndex(ref[1])] = value;
  }
  return [...rows.keys()].sort((left, right) => left - right).map((key) => rows.get(key).map((value) => value ?? ""));
}

function excelDate(serial) {
  const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}-${day}`;
}

function headerKey(label) {
  const name = label.trim().toLowerCase();
  return Object.entries(HEADER).find(([, aliases]) => aliases.includes(name))?.[0] ?? "";
}

function numberValue(value, label, line) {
  const numeric = Number(String(value).replaceAll(",", "").replaceAll("원", "").trim());
  if (!Number.isFinite(numeric)) throw new Error(`${line}번째 줄의 ${label}을 숫자로 읽지 못했습니다.`);
  return numeric;
}

export function rowsFromGrid(grid) {
  if (grid.length < 2) throw new Error("제목 줄과 내용이 있는 파일이어야 합니다.");
  const keys = grid[0].map((label) => headerKey(String(label)));
  const pick = (name) => keys.indexOf(name);
  for (const name of ["couponId", "store", "count", "amount"]) {
    if (pick(name) < 0) throw new Error("쿠폰번호, 매장, 수량, 금액 열이 필요합니다.");
  }
  const rows = [];
  let date = "";
  grid.slice(1).forEach((line, index) => {
    const couponId = String(line[pick("couponId")] ?? "").trim();
    if (!couponId) return;
    const dateIndex = pick("date");
    if (dateIndex >= 0 && !date) {
      const raw = String(line[dateIndex] ?? "").trim();
      date = /^\d{4,5}(\.\d+)?$/.test(raw) ? excelDate(Number(raw)) : raw.slice(0, 10);
    }
    rows.push({
      couponId,
      store: String(line[pick("store")] ?? "").trim(),
      count: numberValue(line[pick("count")], "수량", index + 2),
      amount: numberValue(line[pick("amount")], "금액", index + 2),
    });
  });
  if (rows.length === 0) throw new Error("대조할 내용이 없습니다.");
  return { rows, date };
}

export function readTable(buffer, filename) {
  const extension = filename.toLowerCase().split(".").pop();
  if (extension === "csv" || extension === "txt") return rowsFromGrid(parseCsv(Buffer.from(buffer).toString("utf8")));
  if (extension === "xlsx") return rowsFromGrid(parseXlsx(buffer));
  throw new Error("csv 또는 xlsx 파일만 올릴 수 있습니다.");
}

export function reconcileUploads({ settlementBuffer, settlementName, internalBuffer, internalName }) {
  const settlementTable = readTable(settlementBuffer, settlementName);
  const internalTable = readTable(internalBuffer, internalName);
  const date = settlementTable.date || internalTable.date || "2026-11-06";
  return {
    settlementDate: date,
    settlement: settlementTable.rows,
    internalRecords: internalTable.rows,
    result: reconcile(settlementTable.rows, internalTable.rows, date),
  };
}
