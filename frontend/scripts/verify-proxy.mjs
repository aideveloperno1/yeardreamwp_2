import { wire } from "../tests/chatFixture.js";
import assert from "node:assert/strict";
import http from "node:http";
import { createServer } from "vite";
import { streamChat } from "../src/services/chatClient.js";
import { uploadDocument } from "../src/services/documentClient.js";
import { fetchEvaluation } from "../src/services/evaluationClient.js";
const requests = [];
const backend = http.createServer(async (req, res) => {
  const buffers = [];
  for await (const b of req) buffers.push(b);
  const body = Buffer.concat(buffers).toString();
  requests.push({ path: req.url, body, headers: req.headers });
  if (req.url === "/ask/chat") {
    const data = JSON.parse(body);
    if (data.q === "failure") {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ detail: "시험 오류" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8" });
    const bytes = Buffer.from(wire("개발 프록시 응답"));
    res.write(bytes.subarray(0, 2));
    res.end(bytes.subarray(2));
  } else if (req.url === "/upload") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ upload: ["test.pdf"] }));
  } else if (req.url === "/admin/opik/results") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        experiment_id: "test",
        experiment_name: "시험",
        total: 0,
        averages: {},
        results: [],
      }),
    );
  } else {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => backend.listen(0, "127.0.0.1", resolve));
const target = `http://127.0.0.1:${backend.address().port}`;
let vite;
try {
  vite = await createServer({
    server: {
      host: "127.0.0.1",
      port: 0,
      strictPort: false,
      proxy: {
        "/ask": { target },
        "/upload": { target },
        "/admin": { target },
      },
    },
  });
  await vite.listen();
  const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
  const fetcher = (path, opts) => fetch(base + path, opts);
  assert.equal(
    (await streamChat({
      q: "전체 질문",
      subject: "test-subject",
      onText() {},
      fetcher,
    })).text,
    "개발 프록시 응답",
  );
  assert.equal(requests[0].headers.accept, "application/x-ndjson");
  assert.deepEqual(JSON.parse(requests[0].body), {
    q: "전체 질문",
  });
  await assert.rejects(
    () =>
      streamChat({
        q: "failure",
        subject: "test-subject",
        onText() {},
        fetcher,
      }),
    /시험 오류/,
  );
  assert.deepEqual(
    await uploadDocument({
      subject: "test-subject",
      file: new File(["%PDF-TEST"], "test.pdf", { type: "application/pdf" }),
      fetcher,
    }),
    { upload: ["test.pdf"] },
  );
  const up = requests.find((r) => r.path === "/upload");
  assert.match(up.headers["content-type"], /multipart\/form-data; boundary=/);
  assert.match(up.body, /name="subject"\r\n\r\ntest-subject/);
  assert.match(up.body, /filename="test.pdf"/);
  assert.equal((await fetchEvaluation({ fetcher })).experiment_id, "test");
  const noApi = await fetch(base + "/api/missing", {
    headers: { Accept: "text/html" },
  });
  assert.equal(noApi.status, 501);
  assert.match(noApi.headers.get("content-type"), /json/);
  console.log(
    JSON.stringify(
      {
        developmentProxy: "passed",
        chat: "UTF-8 streaming and q-only",
        upload: "subject/file multipart",
        httpError: "preserved",
        unsupportedApi: "JSON 501",
        backend: "isolated test double; no DB or model calls",
      },
      null,
      2,
    ),
  );
} finally {
  if (vite) await vite.close();
  await new Promise((resolve) => backend.close(resolve));
}
