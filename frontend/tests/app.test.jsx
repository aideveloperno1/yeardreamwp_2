import { chatResponse, sourcesLine, line, source } from "./chatFixture.js";
import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import App from "../src/App.jsx";
import C from "../src/lib/evaluation.js";
import { keys } from "../src/lib/storage.js";
const mount = (path = "/chat") =>
  render(
    <React.StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </React.StrictMode>,
  );
const advance = async (ms) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
const ask = (text) => {
  fireEvent.change(screen.getByLabelText("질문 입력"), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole("button", { name: "보내기" }));
};
const changeMode = (mode) =>
  fireEvent.change(screen.getByLabelText("연결 모드"), {
    target: { value: mode },
  });
const live = () => {
  changeMode("live");
  if (screen.queryByLabelText("등록 법령명 (DB subject)")) {
    fireEvent.change(screen.getByLabelText("등록 법령명 (DB subject)"), {
      target: { value: "db-key" },
    });
  }
};
const nav = (name) =>
  fireEvent.click(
    within(screen.getByRole("navigation", { name: "페이지 이동" })).getByRole(
      "link",
      { name },
    ),
  );

describe("chat and route compatibility", () => {
  it.each(["/chat", "/documents", "/evaluation", "/law", "/trace", "/guide"])(
    "keeps unique accessible IDs and valid control references at %s",
    (path) => {
      mount(path);
      const elements = [...document.querySelectorAll("[id]")];
      expect(new Set(elements.map((e) => e.id)).size).toBe(elements.length);
      for (const e of document.querySelectorAll(
        "[aria-controls],[aria-labelledby],label[for]",
      )) {
        const ids = (
          e.getAttribute("aria-controls") ||
          e.getAttribute("aria-labelledby") ||
          e.getAttribute("for")
        ).split(/\s+/);
        ids.forEach((id) => expect(document.getElementById(id)).not.toBeNull());
      }
    },
  );
  it("blocks blank input, IME Enter and duplicate submissions", async () => {
    vi.useFakeTimers();
    mount();
    fireEvent.click(screen.getByRole("button", { name: "보내기" }));
    expect(screen.getByRole("alert")).toHaveTextContent("질문을 입력");
    expect(screen.getByLabelText("질문 입력")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    const input = screen.getByLabelText("질문 입력");
    fireEvent.change(input, { target: { value: "안전난간 높이" } });
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229, isComposing: true });
    expect(screen.getByRole("log")).not.toHaveTextContent("나 ·");
    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: "Enter", keyCode: 13 });
    expect(screen.getByRole("button", { name: "보내기" })).toBeDisabled();
    fireEvent.submit(input.closest("form"));
    await advance(1300);
    expect(screen.getAllByText("AI 안내")).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(keys("mock").runs))).toHaveLength(1);
  });
  it("handles pending supplement and clears old subject on scope change", async () => {
    vi.useFakeTimers();
    mount();
    ask("안전난간");
    await advance(1300);
    expect(
      screen.getByRole("heading", { name: "안전난간을 어디에 설치하시나요?" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "계단 측면", exact: true }),
    );
    await advance(1300);
    expect(
      screen.getByText("계단 측면", { selector: ".tag" }),
    ).toBeInTheDocument();
    ask("연차휴가");
    await advance(1300);
    const saved = JSON.parse(localStorage.getItem(keys("mock").chat));
    expect(saved.lastTopic).toBeNull();
    expect(saved.pending).toBeNull();
  });
  it("keeps whole answer, opens law panel, restores focus and supports new-chat undo", async () => {
    vi.useFakeTimers();
    mount();
    ask("사다리 위에서 작업");
    await advance(1300);
    expect(
      JSON.parse(localStorage.getItem(keys("mock").runs))[0].answer,
    ).toContain("판단 한계");
    const cite = screen.getByRole("button", { name: "근거 1 조문 상세 보기" });
    cite.focus();
    fireEvent.click(cite);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(cite).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: /새 상담/ }));
    expect(screen.queryByText("AI 안내")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "되돌리기" }));
    expect(screen.getByText("AI 안내")).toBeInTheDocument();
  });
  it("processes legacy index query once under StrictMode", async () => {
    vi.useFakeTimers();
    mount("/index.html?q=" + encodeURIComponent("안전난간 높이"));
    await advance(1400);
    expect(screen.getAllByText("AI 안내")).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(keys("mock").runs))).toHaveLength(1);
  });
  it("keeps conversation across navigation and cancels pending mock request", async () => {
    vi.useFakeTimers();
    mount();
    ask("안전난간 높이");
    nav("법령 RAG 관리");
    await advance(2000);
    nav("상담");
    expect(screen.getByRole("log")).toHaveTextContent("안전난간 높이");
    expect(screen.queryByText("AI 안내")).toBeNull();
    expect(screen.getByRole("button", { name: "보내기" })).toBeEnabled();
  });
  it.each(["/law?id=missing", "/law?id=", "/law.html?id=missing"])(
    "shows missing law for explicit invalid id at %s",
    (path) => {
      mount(path);
      expect(
        screen.getByRole("heading", { name: "조문을 찾을 수 없습니다." }),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("제13조 안전난간의 구조 및 설치요건", {
          selector: "h2",
        }),
      ).toBeNull();
    },
  );
  it("uses default law only when id is absent and supports unknown paths", () => {
    const r = mount("/law");
    expect(
      screen.getByRole("heading", { name: /제13조 안전난간/ }),
    ).toBeInTheDocument();
    r.unmount();
    mount("/unknown");
    expect(
      screen.getByRole("heading", { name: "페이지를 찾을 수 없습니다." }),
    ).toBeInTheDocument();
  });
  it("refuses unknown trace ids, updates hash and supports session tab keyboard", () => {
    mount("/trace.html#run=missing");
    expect(
      screen.getByRole("heading", { name: "기록을 찾을 수 없습니다." }),
    ).toBeInTheDocument();
    const link = screen
      .getAllByRole("link")
      .find((e) => e.getAttribute("href")?.startsWith("/trace#run=RUN-"));
    fireEvent.click(link);
    expect(
      screen.queryByRole("heading", { name: "기록을 찾을 수 없습니다." }),
    ).toBeNull();
    fireEvent.keyDown(screen.getByRole("tab", { name: "실행 기록" }), {
      key: "ArrowRight",
    });
    expect(screen.getByRole("tab", { name: "세션 보기" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
  it("preserves damaged chat without silently overwriting it", async () => {
    vi.useFakeTimers();
    localStorage.setItem(keys("mock").chat, "{bad");
    mount();
    ask("안전난간 높이");
    await advance(1300);
    expect(localStorage.getItem(keys("mock").chat)).toBe("{bad");
    expect(screen.getByRole("status")).toHaveTextContent("기존 자료는 보존");
  });
});
describe("live mode contract and record isolation", () => {
  it("sends complete question without mock classification and renders only actual text", async () => {
    const fetcher = vi.fn(
      async () =>
        chatResponse("실제 수신한 답변 <script>원문 텍스트</script>"),
    );
    vi.stubGlobal("fetch", fetcher);
    mount();
    live();
    ask("연차휴가");
    await screen.findByText(/실제 수신한 답변 <script>/);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      q: "연차휴가",
    });
    expect(
      screen.queryByRole("button", { name: "근거 1 조문 상세 보기" }),
    ).toBeNull();
    expect(document.querySelector(".answer-body script")).toBeNull();
    expect(
      JSON.parse(localStorage.getItem(keys("live").runs))[0],
    ).toMatchObject({
      mode: "live",
      subject: "산업안전보건기준에 관한 규칙",
      contract: "fixed-law-v1",
      receiveState: "received",
    });
    expect(localStorage.getItem(keys("mock").runs)).toBeNull();
    changeMode("mock");
    expect(screen.queryByText(/실제 수신한 답변/)).toBeNull();
    changeMode("live");
    expect(screen.getByText(/실제 수신한 답변/)).toBeInTheDocument();
  });
  it("allows chat without registration subject and never falls back to mock after failure", async () => {
    const fetcher = vi.fn(async () => new Response("error", { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    mount();
    changeMode("live");
    ask("안전난간 높이");
    expect(fetcher).toHaveBeenCalledTimes(1);
    await screen.findByText("오류 종료");
    expect(
      screen.queryByRole("button", { name: "근거 1 조문 상세 보기" }),
    ).toBeNull();
  });
  it("cancels late stream on new chat and undo restores partial text without reissuing request", async () => {
    let controller;
    const fetcher = vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(c) {
              controller = c;
              c.enqueue(new TextEncoder().encode(sourcesLine + line("delta", { text: "앞부분" })));
            },
          }),
          { headers: { "Content-Type": "application/x-ndjson" } },
        ),
    );
    vi.stubGlobal("fetch", fetcher);
    mount();
    live();
    ask("안전난간 높이");
    await screen.findByText("앞부분");
    expect(screen.getByLabelText("연결 모드")).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "＋ 새 상담", exact: true }),
    );
    await act(async () => {
      controller.enqueue(new TextEncoder().encode(line("delta", { text: "뒤늦은 부분" })));
      controller.close();
    });
    expect(screen.queryByText("앞부분")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "되돌리기" }));
    expect(screen.getByText("앞부분")).toBeInTheDocument();
    expect(screen.queryByText(/뒤늦은 부분/)).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(screen.getByText("수신 중단")).toBeInTheDocument();
  });
  it("loads actual evaluation results and keeps zero distinct from missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          experiment_id: "exp",
          experiment_name: "실제 실험",
          total: 2,
          averages: { quality: 0 },
          results: [
            { question: "실제 질문", scores: { quality: 0 } },
            { question: "미측정 질문", scores: {} },
          ],
        }),
      ),
    );
    mount("/evaluation");
    changeMode("live");
    await screen.findByRole("heading", { name: "실제 실험" });
    expect(screen.queryByRole("button", { name: "모의 평가 실행" })).toBeNull();
    expect(screen.getByText("quality: 0")).toBeInTheDocument();
    expect(screen.getByText("미측정")).toBeInTheDocument();
  });
  it("registration subject changes do not reset chat or change fixed-law records", async () => {
    const fetcher = vi.fn(
      async () =>
        chatResponse("이전 실제 답변"),
    );
    vi.stubGlobal("fetch", fetcher);
    mount();
    live();
    ask("첫 질문");
    await screen.findByText("답변 생성 완료");
    nav("법령 RAG 관리");
    fireEvent.change(screen.getByLabelText("등록 법령명 (DB subject)"), {
      target: { value: "other-db" },
    });
    nav("상담");
    expect(screen.getByText("이전 실제 답변")).toBeInTheDocument();
    ask("다음 질문");
    await screen.findAllByText("답변 생성 완료");
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
      q: "다음 질문",
    });
    expect(JSON.parse(localStorage.getItem(keys("live").runs))[0].subject).toBe(
      "산업안전보건기준에 관한 규칙",
    );
  });
});
describe("evaluation interaction", () => {
  it("runs A/B, compares common denominator and links own batch trace", async () => {
    vi.useFakeTimers();
    mount("/evaluation");
    fireEvent.click(screen.getByRole("button", { name: "모의 평가 실행" }));
    expect(
      screen.getByRole("button", { name: "모의 평가 실행" }),
    ).toBeDisabled();
    expect(screen.getByLabelText("연결 모드")).toBeDisabled();
    await advance(1700);
    fireEvent.change(screen.getByLabelText("실행 설정"), {
      target: { value: "B" },
    });
    fireEvent.click(screen.getByRole("button", { name: "모의 평가 실행" }));
    await advance(1700);
    fireEvent.click(screen.getByRole("tab", { name: "전후 비교" }));
    const comparison = screen.getByRole("table", { name: "점수 비교" });
    expect(within(comparison).getByText("5건")).toBeInTheDocument();
    expect(within(comparison).getByText("3건")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "결과" }));
    const id = JSON.parse(sessionStorage.getItem(C.KEY)).batches["prompt:B"].id;
    fireEvent.click(screen.getByRole("link", { name: id + "-EX-01" }));
    expect(
      screen.getByRole("heading", { name: "해당 모의 실행의 설정 B" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/아래 단계/)).toBeNull();
  });
  it("interrupts page exit, retains selection and ignores stale timers after return", async () => {
    vi.useFakeTimers();
    mount("/evaluation");
    fireEvent.change(screen.getByLabelText("비교 유형"), {
      target: { value: "retrieval" },
    });
    fireEvent.click(screen.getByRole("button", { name: "모의 평가 실행" }));
    nav("상담");
    await advance(2000);
    nav("품질 평가");
    expect(screen.getByLabelText("비교 유형")).toHaveValue("retrieval");
    expect(screen.getByRole("status")).toHaveTextContent("중단");
    expect(
      screen.getByRole("button", { name: "모의 평가 실행" }),
    ).toBeEnabled();
  });
  it("shows partial failure separate from excluded and persists under pagehide", async () => {
    vi.useFakeTimers();
    mount("/evaluation");
    fireEvent.click(screen.getByLabelText("EX-03 모의 실패"));
    fireEvent.click(screen.getByRole("button", { name: "모의 평가 실행" }));
    await advance(1700);
    expect(screen.getByRole("status")).toHaveTextContent(
      "완료 4 · 실패 1 · 제외 1",
    );
    fireEvent.click(screen.getByRole("button", { name: "모의 평가 실행" }));
    fireEvent(window, new Event("pagehide"));
    expect(screen.getByRole("status")).toHaveTextContent("중단");
  });
});
describe("document registration and themes", () => {
  it("shows malformed successful upload as unknown and allows correction without auto retry", async () => {
    const fetcher = vi.fn(async () => Response.json({ upload: ["   "] }));
    vi.stubGlobal("fetch", fetcher);
    mount("/documents");
    live();
    fireEvent.change(screen.getByLabelText("PDF 파일"), {
      target: { files: [new File(["x"], "live.pdf")] },
    });
    fireEvent.click(
      screen.getByLabelText(
        "같은 subject의 기존 청크가 교체되는 것을 확인했습니다.",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "서버에 등록" }));
    await screen.findByRole("heading", { name: "결과 확인 필요" });
    expect(screen.getByText(/등록 응답 형식이 다릅니다/)).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "등록 응답 수신" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "서버에 등록" })).toBeEnabled();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("validates input, locks duplicate registration across route changes and finishes mock result", async () => {
    vi.useFakeTimers();
    mount("/documents");
    fireEvent.click(screen.getByRole("button", { name: "모의 등록" }));
    expect(screen.getByText("PDF 파일을 선택하세요.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("PDF 파일"), {
      target: {
        files: [new File(["x"], "demo.pdf", { type: "application/pdf" })],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "모의 등록" }));
    expect(screen.getByLabelText("PDF 파일")).toBeDisabled();
    nav("상담");
    nav("법령 RAG 관리");
    expect(screen.getByLabelText("PDF 파일")).toBeDisabled();
    await advance(700);
    expect(screen.getByText(/조문 24개/)).toBeInTheDocument();
  });
  it("shows unknown upload result on network failure and never invents chunk count", async () => {
    const fetcher = vi.fn(async () => {
      throw Error("disconnected");
    });
    vi.stubGlobal("fetch", fetcher);
    mount("/documents");
    live();
    fireEvent.change(screen.getByLabelText("PDF 파일"), {
      target: { files: [new File(["x"], "live.pdf")] },
    });
    fireEvent.click(
      screen.getByLabelText(
        "같은 subject의 기존 청크가 교체되는 것을 확인했습니다.",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "서버에 등록" }));
    await screen.findByRole("heading", { name: "결과 확인 필요" });
    expect(screen.queryByText(/조문 24개/)).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("restores result-unknown state for upload interrupted by reload", () => {
    sessionStorage.setItem(
      "safety-chat.live.upload.v1",
      JSON.stringify({
        state: "running",
        mode: "live",
        subject: "DB",
        filename: "saved.pdf",
      }),
    );
    mount("/documents");
    changeMode("live");
    expect(
      screen.getByRole("heading", { name: "결과 확인 필요" }),
    ).toBeInTheDocument();
  });
  it("applies light/dark/system, storage sync and media listener cleanup", () => {
    const r = mount();
    fireEvent.click(screen.getByRole("button", { name: "다크 모드" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("safety-chat.theme")).toBe("dark");
    localStorage.setItem("safety-chat.theme", "light");
    fireEvent(
      window,
      new StorageEvent("storage", { key: "safety-chat.theme" }),
    );
    expect(document.documentElement.dataset.theme).toBe("light");
    fireEvent.click(screen.getByRole("button", { name: "시스템 설정 따르기" }));
    const media = matchMedia("(prefers-color-scheme: dark)");
    media.matches = true;
    const callback = media.addEventListener.mock.calls.at(-1)[1];
    act(callback);
    expect(document.documentElement.dataset.theme).toBe("dark");
    r.unmount();
    expect(media.removeEventListener).toHaveBeenCalled();
    media.matches = false;
  });
});
