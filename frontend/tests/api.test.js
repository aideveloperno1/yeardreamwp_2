import { wire, sourcesLine, line } from "./chatFixture.js";
import { expect, it, vi } from "vitest";
import { streamChat, errorMessage } from "../src/services/chatClient.js";
import { uploadDocument } from "../src/services/documentClient.js";
const response = (chunks, type = "application/x-ndjson") =>
  new Response(
    new ReadableStream({
      start(c) {
        chunks.forEach((x) => c.enqueue(x));
        c.close();
      },
    }),
    { headers: { "Content-Type": type } },
  );
it("decodes Korean split inside UTF-8 characters and uses current q-only contract", async () => {
  const bytes = new TextEncoder().encode(wire("안전난간 높이 90cm"));
  const fetcher = vi.fn(async () =>
    response([bytes.slice(0, 1), bytes.slice(1, 5), bytes.slice(5)]),
  );
  const onText = vi.fn();
  expect(
    await streamChat({ q: "질문", subject: "db-key", onText, fetcher }),
  ).toMatchObject({ text: "안전난간 높이 90cm", generationStatus: "completed" });
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
    q: "질문",
  });
  expect(onText).toHaveBeenLastCalledWith("안전난간 높이 90cm");
});
it("rejects HTTP errors using server detail", async () => {
  await expect(
    streamChat({
      q: "q",
      subject: "s",
      onText() {},
      fetcher: async () =>
        new Response(JSON.stringify({ detail: "질문과 법령명" }), {
          status: 400,
        }),
    }),
  ).rejects.toThrow("질문과 법령명");
});
it("rejects empty and unexpected HTML responses", async () => {
  await expect(
    streamChat({ onText() {}, fetcher: async () => response([]) }),
  ).rejects.toThrow("종료 상태");
  await expect(
    streamChat({
      onText() {},
      fetcher: async () =>
        response([new TextEncoder().encode("fallback")], "text/html"),
    }),
  ).rejects.toThrow("응답 형식");
});
it("retains delivered partial text when stream later fails", async () => {
  let controller;
  const onText = vi.fn();
  const promise = streamChat({
    onText,
    fetcher: async () =>
      new Response(
        new ReadableStream({
          start(c) {
            controller = c;
            c.enqueue(new TextEncoder().encode(sourcesLine + line("delta", { text: "부분 답변" })));
          },
        }),
        { headers: { "Content-Type": "application/x-ndjson" } },
      ),
  });
  await vi.waitFor(() => expect(onText).toHaveBeenCalledWith("부분 답변"));
  controller.error(Error("broken"));
  await expect(promise).rejects.toThrow("broken");
});
it("sends multipart subject/file without setting a boundary manually", async () => {
  const file = new File(["%PDF"], "시험.pdf", { type: "application/pdf" });
  const fetcher = vi.fn(async () => Response.json({ upload: [file.name] }));
  expect(await uploadDocument({ file, subject: "DB", fetcher })).toEqual({
    upload: ["시험.pdf"],
  });
  const opts = fetcher.mock.calls[0][1];
  expect(opts.headers).toBeUndefined();
  expect(opts.body.get("subject")).toBe("DB");
  expect(opts.body.get("file").name).toBe(file.name);
});
it("rejects upload failures and success responses with wrong schema", async () => {
  await expect(
    uploadDocument({
      file: new File(["x"], "x.pdf"),
      subject: "DB",
      fetcher: async () => new Response("", { status: 500 }),
    }),
  ).rejects.toMatchObject({ status: 500 });
  await expect(
    uploadDocument({
      file: new File(["x"], "x.pdf"),
      subject: "DB",
      fetcher: async () => Response.json({ fakeCount: 31 }),
    }),
  ).rejects.toThrow("응답 형식");
});

it.each([null, { upload: [""] }, { upload: ["   "] }])(
  "rejects malformed upload success payload %j with a user-facing error",
  async (payload) => {
    await expect(
      uploadDocument({
        file: new File(["x"], "x.pdf"),
        subject: "DB",
        fetcher: async () => Response.json(payload),
      }),
    ).rejects.toMatchObject({
      name: "ApiError",
      status: null,
      message: expect.stringContaining("등록 응답 형식"),
    });
  },
);
it("labels server failures as server failures even when JSON lacks detail", async () => {
  expect(
    await errorMessage(Response.json({ error: "internal" }, { status: 503 })),
  ).toBe("서버 요청 실패 (HTTP 503)");
});
it("explains known validation fields without echoing submitted input", async () => {
  const message = await errorMessage(
    Response.json(
      {
        detail: [
          { loc: ["body", "subject"], type: "missing", input: "PRIVATE_INPUT" },
          { loc: ["body", "q"], type: "string_type", input: "PRIVATE_INPUT" },
        ],
      },
      { status: 422 },
    ),
  );
  expect(message).toContain("DB subject");
  expect(message).toContain("질문");
  expect(message).toContain("422");
  expect(message).not.toContain("PRIVATE_INPUT");
});
it("rejects a MIME type that only starts with text/plain", async () => {
  await expect(
    streamChat({
      onText() {},
      fetcher: async () =>
        response(
          [new TextEncoder().encode("not plain text")],
          "text/plain-invalid",
        ),
    }),
  ).rejects.toThrow("응답 형식");
});
it("accepts NDJSON with charset parameters", async () => {
  expect(
    await streamChat({
      onText() {},
      fetcher: async () =>
        response(
          [new TextEncoder().encode(wire("정상 응답"))],
          "application/x-ndjson; charset=utf-8",
        ),
    }),
  ).toMatchObject({ text: "정상 응답" });
});
