import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { exec } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { reconcile } from "./src/reconcile.mjs";
import { reconcileUploads } from "./src/parse-sheet.mjs";
import { internalRecords, settlement, settlementDate } from "./src/sample.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = 3460;

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > 8_000_000) {
        reject(new Error("파일이 너무 큽니다."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  if (request.method === "POST" && url.pathname === "/api/reconcile") {
    try {
      const payload = JSON.parse((await readBody(request)).toString("utf8"));
      const result = reconcileUploads({
        settlementBuffer: Buffer.from(payload.settlementFile?.base64 ?? "", "base64"),
        settlementName: payload.settlementFile?.name ?? "",
        internalBuffer: Buffer.from(payload.internalFile?.base64 ?? "", "base64"),
        internalName: payload.internalFile?.name ?? "",
      });
      sendJson(response, 200, result);
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : "파일을 대조하지 못했습니다." });
    }
    return;
  }
  if (url.pathname === "/api/sample") {
    const body = JSON.stringify({
      settlementDate,
      settlement,
      internalRecords,
      result: reconcile(settlement, internalRecords, settlementDate),
    });
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(body);
    return;
  }

  const name = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
  const filePath = path.resolve(root, "public", name);
  if (!filePath.startsWith(`${path.resolve(root, "public")}${path.sep}`)) {
    response.writeHead(404);
    response.end("not found");
    return;
  }
  try {
    const body = await readFile(filePath);
    const extension = path.extname(filePath);
    response.writeHead(200, { "content-type": types[extension] ?? "text/plain; charset=utf-8" });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end("not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  const address = `http://127.0.0.1:${port}`;
  console.log(address);
  if (process.argv.includes("--open")) exec(`start ${address}`);
});
