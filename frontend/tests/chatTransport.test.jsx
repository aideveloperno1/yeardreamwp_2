import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { expect, it, vi } from "vitest";
import App from "../src/App.jsx";
import { streamChat } from "../src/services/chatClient.js";
import { keys, restoreChat, validChat, validRuns } from "../src/lib/storage.js";
import { line, wire, sourcesLine, source, chatResponse } from "./chatFixture.js";
import { validChat as oldValidChat, validRuns as oldValidRuns } from "./fixtures/storage_before.js";
const response = (body) => new Response(body, { headers: { "Content-Type": "application/x-ndjson" } });
const mount = () => { render(<MemoryRouter><App /></MemoryRouter>); fireEvent.change(screen.getByLabelText("연결 모드"), { target: { value: "live" } }); };
const ask = () => { fireEvent.change(screen.getByLabelText("질문 입력"), { target: { value: "시험 질문" } }); fireEvent.click(screen.getByRole("button", { name: "보내기" })); };

it("parses every byte boundary including Korean characters, CRLF and literal error text", async () => {
  const bytes = new TextEncoder().encode(wire("한글\n[오류]라는 문자열도 본문입니다.").replaceAll("\n", "\r\n"));
  const body = new ReadableStream({ start(c) { for (const b of bytes) c.enqueue(Uint8Array.of(b)); c.close(); } });
  const result = await streamChat({ q: "q", fetcher: async () => response(body) });
  expect(result.text).toBe("한글\n[오류]라는 문자열도 본문입니다.");
  expect(result.retrievedSources).toEqual([source]);
});
it.each([
  [line("delta", { text: "before sources" }), "응답 형식"],
  [sourcesLine + sourcesLine, "응답 형식"],
  [sourcesLine + '{bad}\n', "응답 형식"],
  [sourcesLine.replace('"v":1', '"v":2'), "응답 형식"],
  [wire() + line("delta", { text: "after done" }), "응답 형식"],
  [wire().trimEnd(), "응답 형식"],
  [sourcesLine + line("delta", { text: "partial" }), "종료 상태"],
  [sourcesLine + line("done", { status: "completed", finish_reason: "stop" }), "응답 형식"],
  [wire("text", "completed", "length"), "응답 형식"],
  [sourcesLine + line("unknown"), "응답 형식"],
])("rejects malformed or inconsistent terminal sequences %#", async (body, message) => {
  await expect(streamChat({ fetcher: async () => response(body) })).rejects.toThrow(message);
});
it("does not retry a legacy server or make another model request", async () => {
  const fetcher = vi.fn(async () => new Response("old plain answer"));
  await expect(streamChat({ fetcher })).rejects.toThrow("응답 형식");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("cancels a reader when parsing fails", async () => {
  const cancel = vi.fn();
  const body = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{bad}\n')); }, cancel });
  await expect(streamChat({ fetcher: async () => response(body) })).rejects.toThrow();
  expect(cancel).toHaveBeenCalledTimes(1);
});
it.each([["length", "길이 제한으로 중단"], [null, "완료 여부 확인 불가"]])("shows distinct completion states %s", async (reason, label) => {
  vi.stubGlobal("fetch", vi.fn(async () => response(wire("답변 본문", reason === "length" ? "incomplete" : "unverified", reason))));
  mount(); ask();
  await screen.findByText(label);
  expect(screen.getByText("제13조 · 안전난간")).toBeInTheDocument();
});
it("shows no results separately and stores the state", async () => {
  const body = line("sources", { search_status: "no_results", items: [] }) + line("delta", { text: "관련 조문을 찾지 못했습니다." }) + line("done", { status: "no_results", finish_reason: null });
  vi.stubGlobal("fetch", vi.fn(async () => response(body)));
  mount(); ask();
  await screen.findByText("검색 결과 없음");
  const saved = JSON.parse(localStorage.getItem(keys("live").runs))[0];
  expect(saved).toMatchObject({ searchStatus: "no_results", generationStatus: "no_results", retrievedSources: [] });
});
it("preserves partial answer and sources on a model error and in trace detail", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => response(sourcesLine + line("delta", { text: "부분 답변" }) + line("error", { code: "LLM_ERROR", stage: "generation", message: "시험 생성 오류" }))));
  mount(); ask();
  await screen.findByText("오류 종료 · 일부 답변");
  expect(screen.getByText("부분 답변")).toBeInTheDocument();
  expect(screen.getByText("제13조 · 안전난간")).toBeInTheDocument();
  const saved = JSON.parse(localStorage.getItem(keys("live").runs));
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ answer: "부분 답변", retrievedSources: [source], generationStatus: "error" });
  fireEvent.click(screen.getByRole("link", { name: "실행 추적", exact: true }));
  expect(screen.getByText("부분 답변")).toBeInTheDocument();
  expect(screen.getByText("제13조 · 안전난간")).toBeInTheDocument();
});
it.each([false, true])("preserves sources when cancelled after sources or text: %s", async (withText) => {
  let controller;
  vi.stubGlobal("fetch", vi.fn(async () => response(new ReadableStream({ start(c) { controller = c; c.enqueue(new TextEncoder().encode(sourcesLine + (withText ? line("delta", { text: "받은 앞부분" }) : ""))); } }))));
  mount(); ask();
  await screen.findByText("제13조 · 안전난간");
  fireEvent.click(screen.getByRole("button", { name: "＋ 새 상담", exact: true }));
  await act(async () => { controller.close(); });
  const runs = JSON.parse(localStorage.getItem(keys("live").runs));
  expect(runs).toHaveLength(1);
  expect(runs[0]).toMatchObject({ status: "interrupted", generationStatus: "cancelled", retrievedSources: [source], answer: withText ? "받은 앞부분" : "" });
});
it("restores old records and interrupted new records without fabricating sources", () => {
  const old = { sessionId: "S", messages: [{ role: "ai", result: { runId: "old", status: "received", text: "이전" } }] };
  expect(validChat(old)).toBe(true);
  localStorage.setItem(keys("live").chat, JSON.stringify(old));
  expect(restoreChat("live").value.messages[0].result.retrievedSources).toBeUndefined();
  const newer = { ...old, messages: [{ role: "ai", result: { runId: "new", status: "streaming", text: "일부", generationStatus: "streaming", retrievedSources: [source], searchStatus: "found" } }] };
  expect(oldValidChat(newer)).toBe(true);
  expect(oldValidRuns([{ id: "new", sessionId: "S", question: "q", status: "received", generationStatus: "completed", retrievedSources: [source] }])).toBe(true);
  localStorage.setItem(keys("live").chat, JSON.stringify(newer));
  expect(restoreChat("live").value.messages[0].result).toMatchObject({ status: "interrupted", generationStatus: "cancelled", retrievedSources: [source], text: "일부" });
  expect(validRuns([{ id: "r", sessionId: "S", question: "q", retrievedSources: [{ source_id: "bad" }] }])).toBe(false);
});
