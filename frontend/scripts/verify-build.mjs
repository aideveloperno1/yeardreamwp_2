import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { preview } from "vite";

const server = await preview({
  preview: { host: "127.0.0.1", port: 0, strictPort: false },
});
const port = server.httpServer.address().port;
const base = `http://127.0.0.1:${port}`;
const checks = [];
try {
  const html = await readFile(
    new URL("../dist/index.html", import.meta.url),
    "utf8",
  );
  for (const path of [
    "/",
    "/chat",
    "/documents",
    "/evaluation",
    "/law?id=g13",
    "/trace",
    "/guide",
    "/index.html?q=test",
    "/documents.html",
    "/evaluation.html",
    "/law.html?id=g13",
    "/trace.html",
    "/guide.html",
    "/unknown",
  ]) {
    const r = await fetch(base + path, { headers: { Accept: "text/html" } });
    assert.equal(r.status, 200, path);
    assert.equal(await r.text(), html, path);
    checks.push({
      path,
      status: r.status,
      kind: "SPA document (client routing tested separately)",
    });
  }
  const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((v) => v[1]);
  for (const path of assets) {
    const r = await fetch(base + path);
    assert.equal(r.status, 200, path);
    const bytes = Buffer.from(await r.arrayBuffer());
    const expected = await readFile(new URL("../dist" + path, import.meta.url));
    assert.deepEqual(bytes, expected, path);
    if (path.endsWith(".css"))
      assert.match(r.headers.get("content-type"), /text\/css/);
    if (path.endsWith(".js"))
      assert.match(r.headers.get("content-type"), /javascript/);
    checks.push({ path, status: r.status, bytes: bytes.length });
  }
  for (const [path, hash] of [
    [
      "/fonts/PretendardVariable.woff2",
      "9599f12fd42fc0bce1cd50b47a0c022e108d7aa64dd0d1bb0ed44f3282d900b4",
    ],
    [
      "/fonts/LICENSE.txt",
      "d31ddd9f2bed32fd7e302a205cf2380ba0de6529152d239ef99cfb6f261bfc04",
    ],
  ]) {
    const r = await fetch(base + path + "?v=1");
    const bytes = Buffer.from(await r.arrayBuffer());
    assert.equal(r.status, 200);
    // Git on Windows may check out text with CRLF; font bytes remain exact.
    const hashBytes = path.endsWith(".txt")
      ? Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n"))
      : bytes;
    assert.equal(createHash("sha256").update(hashBytes).digest("hex"), hash);
    const head = await fetch(base + path, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal((await head.arrayBuffer()).byteLength, 0);
    checks.push({ path, sha256: hash, head: true });
  }
  for (const path of [
    "/ask/chat",
    "/admin/opik/results",
    "/upload",
    "/docs",
    "/openapi.json",
    "/api/missing",
  ]) {
    for (const method of ["GET", "POST"]) {
      const r = await fetch(base + path, {
        method,
        headers: { Accept: "text/html" },
      });
      assert.equal(r.status, 503);
      assert.match(r.headers.get("content-type"), /json/);
      assert.ok((await r.json()).detail);
      checks.push({ path, method, status: r.status });
    }
  }
  for (const path of [
    "/.env",
    "/package.json",
    "/vite.config.js",
    "/src/main.jsx",
    "/README.md",
    "/assets/missing.js",
  ]) {
    const r = await fetch(base + path);
    assert.equal(r.status, 404, path);
    checks.push({ path, status: r.status });
  }
  const files = await readdir(new URL("../dist/assets/", import.meta.url));
  assert.ok(files.some((x) => x.endsWith(".js")));
  console.log(JSON.stringify({ builtHttp: "passed", checks }, null, 2));
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
