const report = document.querySelector("#report");
const errorBox = document.querySelector("#error");

function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

async function filePayload(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return { name: file.name, base64: btoa(binary) };
}

function won(value) {
  const sign = value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toLocaleString("ko-KR")}원`;
}

function signed(value, unit) {
  if (value === 0) return `0${unit}`;
  const sign = value > 0 ? "+" : "-";
  return `${sign}${Math.abs(value).toLocaleString("ko-KR")}${unit}`;
}

function table(headers, rows) {
  const head = headers.map((header) => `<th>${header}</th>`).join("");
  const body = rows.length === 0
    ? `<tr><td colspan="${headers.length}">없음</td></tr>`
    : rows.join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function sourceRows(rows) {
  return rows.map((row) => `<tr><td>${esc(row.couponId)}</td><td>${esc(row.store)}</td><td class="num">${row.count}</td><td class="num">${won(row.amount)}</td></tr>`);
}

function render(data) {
  const { result } = data;
  const amountClass = result.amountDifference === 0 ? "" : "minus";
  report.innerHTML = `
    <p class="muted">정산일 ${esc(data.settlementDate)}</p>
    <div class="cards">
      <article class="card"><span>금액 차이</span><strong class="${amountClass}">${signed(result.amountDifference, "원")}</strong><span class="muted">정산 ${won(result.settlementAmount)} · 내부 ${won(result.internalAmount)}</span></article>
      <article class="card"><span>자료 건수 차이</span><strong>${signed(result.countDifference, "건")}</strong><span class="muted">정산 ${result.settlementCount}건 · 내부 ${result.internalCount}건</span></article>
      <article class="card"><span>쿠폰 수량 차이</span><strong>${signed(result.quantityDifference, "장")}</strong><span class="muted">정산 ${result.settlementQuantity}장 · 내부 ${result.internalQuantity}장</span></article>
      <article class="card"><span>누락</span><strong>${result.missingInInternal.length + result.missingInSettlement.length}건</strong><span class="muted">정산에만 ${result.missingInInternal.length} · 내부에만 ${result.missingInSettlement.length}</span></article>
    </div>
    <div class="split">
      <section class="panel"><h2>쿠폰 정산 자료</h2>${table(["쿠폰", "매장", "수량", "금액"], sourceRows(data.settlement))}</section>
      <section class="panel"><h2>내부 자료</h2>${table(["쿠폰", "매장", "수량", "금액"], sourceRows(data.internalRecords))}</section>
    </div>
    <div class="stack">
      <section class="panel">
        <h2>차이</h2>
        <h3>금액이 다른 건</h3>
        ${table(["쿠폰", "매장", "정산 금액", "내부 금액", "차이"], result.amountMismatches.map((row) => `<tr><td>${esc(row.couponId)}</td><td>${esc(row.store)}</td><td class="num">${won(row.settlementAmount)}</td><td class="num">${won(row.internalAmount)}</td><td class="num">${signed(row.difference, "원")}</td></tr>`))}
        <h3>수량이 다른 건</h3>
        ${table(["쿠폰", "매장", "정산 수량", "내부 수량", "차이"], result.countMismatches.map((row) => `<tr><td>${esc(row.couponId)}</td><td>${esc(row.store)}</td><td class="num">${row.settlementCount}</td><td class="num">${row.internalCount}</td><td class="num">${signed(row.difference, "장")}</td></tr>`))}
        <h3>누락</h3>
        ${table(["구분", "쿠폰", "매장", "수량", "금액"], [
          ...result.missingInInternal.map((row) => `<tr><td>정산에만 있음</td><td>${esc(row.couponId)}</td><td>${esc(row.store)}</td><td class="num">${row.count}</td><td class="num">${won(row.amount)}</td></tr>`),
          ...result.missingInSettlement.map((row) => `<tr><td>내부에만 있음</td><td>${esc(row.couponId)}</td><td>${esc(row.store)}</td><td class="num">${row.count}</td><td class="num">${won(row.amount)}</td></tr>`),
        ])}
      </section>
      <section class="panel">
        <h2>인보이스 ${esc(result.invoice.invoiceNo)}</h2>
        <p class="muted">${esc(result.invoice.buyer)} · ${esc(result.invoice.date)} · 일치 ${result.matched.length}건</p>
        ${table(["쿠폰", "내용", "수량", "금액"], result.invoice.lines.map((line) => `<tr><td>${esc(line.couponId)}</td><td>${esc(line.description)}</td><td class="num">${line.count}</td><td class="num">${won(line.amount)}</td></tr>`))}
        <p><strong>합계 ${won(result.invoice.totalAmount)}</strong></p>
      </section>
      <section class="panel">
        <h2>전표 ${esc(result.voucher.voucherNo)}</h2>
        <p class="muted">${esc(result.voucher.memo)} · ${esc(result.voucher.date)}</p>
        ${table(["구분", "계정", "금액"], result.voucher.lines.map((line) => `<tr><td>${esc(line.side)}</td><td>${esc(line.account)}</td><td class="num">${won(line.amount)}</td></tr>`))}
      </section>
    </div>
  `;
}

window.renderCoupon = render;

function showError(error) {
  errorBox.hidden = false;
  errorBox.textContent = error instanceof Error ? error.message : "대조하지 못했습니다.";
}

const emptyReport = "파일을 두 칸에 넣은 뒤 ‘정산 대조’를 누르면 결과가 나옵니다. 파일이 없으면 샘플 자료로 대조합니다.";

function bindFileName(input) {
  const nameEl = input.closest("label")?.querySelector(".file-name");
  if (!nameEl) return;
  const fallback = nameEl.dataset.defaultName || "선택된 파일 없음";
  const update = () => {
    const selected = input.files[0];
    nameEl.textContent = selected ? selected.name : fallback;
    nameEl.classList.toggle("is-empty", !selected && !nameEl.dataset.defaultName);
  };
  input.addEventListener("change", update);
  update();
}

function resetFileLabels() {
  document.querySelectorAll(".file-name").forEach((el) => {
    const fallback = el.dataset.defaultName || "선택된 파일 없음";
    el.textContent = fallback;
    el.classList.toggle("is-empty", !el.dataset.defaultName);
  });
}

bindFileName(document.querySelector("#settlement-file"));
bindFileName(document.querySelector("#internal-file"));

async function loadSample() {
  const response = await fetch("/api/sample");
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "샘플 자료를 불러오지 못했습니다.");
  render(body);
}

function resetView() {
  errorBox.hidden = true;
  document.querySelector("#upload").reset();
  resetFileLabels();
  report.innerHTML = `<p class="muted">${emptyReport}</p>`;
}

if (location.hash === "#sample") {
  loadSample().catch(showError);
}

document.querySelector("#upload").addEventListener("submit", async (event) => {
  event.preventDefault();
  errorBox.hidden = true;
  const settlementFile = document.querySelector("#settlement-file").files[0];
  const internalFile = document.querySelector("#internal-file").files[0];
  try {
    if (!settlementFile || !internalFile) {
      await loadSample();
      return;
    }
    const response = await fetch("/api/reconcile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        settlementFile: await filePayload(settlementFile),
        internalFile: await filePayload(internalFile),
      }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "파일을 대조하지 못했습니다.");
    render(body);
  } catch (error) {
    showError(error);
  }
});

document.querySelector("#reset-run")?.addEventListener("click", resetView);
