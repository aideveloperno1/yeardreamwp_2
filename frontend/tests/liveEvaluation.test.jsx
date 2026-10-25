import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import LiveEvaluation from "../src/components/LiveEvaluation.jsx";
import { fetchEvaluation } from "../src/services/evaluationClient.js";
import { freshChat, keys } from "../src/lib/storage.js";
import { MemoryRouter } from "react-router";
import App from "../src/App.jsx";
const data = {
  experiment_id: "exp",
  experiment_name: "실험",
  total: 1,
  averages: { metric: 0.5 },
  results: [{ question: "질문", scores: { metric: 0.5 } }],
};
it("rejects HTTP, HTML, malformed scores and inconsistent item count", async () => {
  for (const response of [
    new Response("<html>"),
    Response.json({ ...data, total: 2 }),
    Response.json({ ...data, averages: { metric: null } }),
  ]) {
    await expect(
      fetchEvaluation({ fetcher: async () => response }),
    ).rejects.toThrow();
  }
  await expect(
    fetchEvaluation({
      fetcher: async () =>
        Response.json({ detail: "Opik 오류" }, { status: 502 }),
    }),
  ).rejects.toThrow("Opik 오류");
});
it("shows empty result without inventing scores", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ ...data, total: 0, averages: {}, results: [] }),
    ),
  );
  render(<LiveEvaluation />);
  await screen.findByText("조회된 평가 항목이 없습니다.");
  expect(screen.getByText("조회된 평가 점수가 없습니다.")).toBeInTheDocument();
});
it("retains prior data with explicit warning on failed refresh", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(Response.json(data))
      .mockResolvedValueOnce(
        Response.json({ detail: "갱신 오류" }, { status: 502 }),
      ),
  );
  render(<LiveEvaluation />);
  await screen.findByRole("heading", { name: "실험" });
  fireEvent.click(screen.getByRole("button", { name: "평가 결과 새로고침" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("alert")).toHaveTextContent("마지막 성공 조회 결과");
  expect(screen.getByText("metric: 0.5")).toBeInTheDocument();
});
it("aborts unmounted requests and ignores their late response", async () => {
  let resolve;
  let signal;
  vi.stubGlobal(
    "fetch",
    vi.fn((_, opts) => {
      signal = opts.signal;
      return new Promise((r) => {
        resolve = r;
      });
    }),
  );
  const view = render(<LiveEvaluation />);
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(Response.json(data)));
  expect(screen.queryByRole("heading", { name: "실험" })).toBeNull();
});
it("preserves legacy chat and labels historical subject as unconfirmed", async () => {
  const old = {
    ...freshChat(),
    subject: "old-db",
    messages: [
      { role: "user", text: "과거 질문" },
      {
        role: "ai",
        result: { runId: "old", status: "received", text: "과거 답변" },
      },
    ],
  };
  localStorage.setItem(keys("live").chat, JSON.stringify(old));
  localStorage.setItem(
    keys("live").runs,
    JSON.stringify([
      {
        id: "old",
        sessionId: old.sessionId,
        question: "과거 질문",
        answer: "과거 답변",
        mode: "live",
        subject: "old-db",
        status: "received",
      },
    ]),
  );
  render(
    <MemoryRouter initialEntries={["/trace#run=old"]}>
      <App />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText("연결 모드"), {
    target: { value: "live" },
  });
  expect(screen.getByText(/당시 화면의 법령 설정값/)).toHaveTextContent(
    "old-db",
  );
  expect(JSON.parse(localStorage.getItem(keys("live").chat)).messages).toEqual(
    old.messages,
  );
});
