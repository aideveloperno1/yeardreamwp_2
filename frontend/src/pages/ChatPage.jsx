import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useApp } from "../hooks/AppState.jsx";
import M from "../lib/mockData.js";
import { fmtTime } from "../lib/storage.js";
import AnswerCard from "../components/AnswerCard.jsx";
import { LawPanel } from "../components/LawView.jsx";
const overrideLabels = {
  auto: "자동(질문 내용 기준)",
  answer: "정상 답변",
  clarify: "추가 질문",
  hold: "근거 부족 보류",
  out: "범위 밖",
  unclassified: "분류 불가",
  nodata: "목업 예시 없음",
  error_llm: "AI 응답 오류",
  error_search: "검색 오류",
};
export default function ChatPage() {
  const app = useApp();
  const { chat } = app;
  const [text, setText] = useState("");
  const [validation, setValidation] = useState("");
  const [review, setReview] = useState(false);
  const [law, setLaw] = useState(null);
  const input = useRef(null);
  const end = useRef(null);
  const composing = useRef(false);
  const loc = useLocation();
  const navigate = useNavigate();
  const consumed = useRef(null);
  useEffect(() => {
    document.body.classList.toggle("review-open", review);
    return () => document.body.classList.remove("review-open");
  }, [review]);
  useEffect(() => () => app.cancelChat(), []);
  useEffect(() => {
    const p = new URLSearchParams(loc.search);
    const q = p.get("q");
    if (!q || consumed.current === loc.key) return;
    const timer = setTimeout(() => {
      if (chat.busy) return;
      consumed.current = loc.key;
      setText(q);
      app.send(q);
      setText("");
      p.delete("q");
      navigate(
        {
          pathname: "/chat",
          search: p.toString() ? "?" + p.toString() : "",
          hash: loc.hash,
        },
        { replace: true },
      );
    }, 0);
    return () => clearTimeout(timer);
  }, [loc.key]);
  useEffect(() => {
    const el = input.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 160) + "px";
    }
  }, [text]);
  useEffect(() => {
    end.current?.scrollIntoView?.({
      block: "nearest",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, [chat.messages.length, chat.busy]);
  const edit = (value) => {
    setText(
      value ||
        [...chat.messages].reverse().find((m) => m.role === "user")?.text ||
        "",
    );
    input.current?.focus();
  };
  const submit = async (e) => {
    e?.preventDefault();
    if (chat.busy) return;
    if (!text.trim()) {
      setValidation("질문을 입력해 주세요.");
      input.current?.focus();
      return;
    }
    setValidation("");
    const q = text;
    setText("");
    app.send(q);
  };
  const lastAI = chat.messages.findLastIndex((m) => m.role === "ai");
  const help = (
    <>
      <p>
        산업안전보건기준에 관한 규칙의 작업장 안전기준
        (통로·계단·안전난간·사다리·추락 방지·보호구 등)
      </p>
      <ul>
        <li>장소: 어디에서 일하는지</li>
        <li>작업: 무엇을 설치하거나 어떤 작업을 하는지</li>
        <li>궁금한 기준: 높이·폭·하중 같은 수치나 적용 조건</li>
      </ul>
      <p>
        {app.mode === "mock"
          ? "같은 상담 안에서는 앞선 주제를 이어서 참고하는 모의 동작을 제공합니다."
          : "현재 API는 이전 대화를 받지 않습니다. 질문마다 장소와 작업 상황을 함께 적어 주세요."}
      </p>
    </>
  );
  return (
    <>
      {app.mode === "mock" && (
        <section className="review" aria-label="검토 도구">
          <div className="review-strip">
            <span className="grow">
              다음 응답: <strong>{overrideLabels[app.override]}</strong>
            </span>
            <button
              className="review-toggle"
              aria-expanded={review}
              aria-controls="review-panel"
              onClick={() => setReview((v) => !v)}
            >
              검토 도구 {review ? "닫기" : "열기"}
            </button>
          </div>
          <div className="review-panel" id="review-panel" hidden={!review}>
            <div>
              <h3>
                다음 응답 결과 지정{" "}
                <span className="review-note">
                  한 번 적용 후 자동으로 돌아갑니다
                </span>
              </h3>
              <div className="overrides">
                {Object.entries(overrideLabels).map(([id, label]) => (
                  <button
                    key={id}
                    aria-pressed={app.override === id}
                    disabled={chat.busy}
                    onClick={() => app.setOverride(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h3>예시 질문 · 평가셋 문항 아님</h3>
              <div className="review-examples">
                {M.examples.map((e) => (
                  <button
                    className="btn"
                    key={e.label}
                    disabled={chat.busy}
                    onClick={() => app.send(e.q)}
                  >
                    {e.label} · {e.note}
                  </button>
                ))}
              </div>
            </div>
            <p className="review-note">
              세션 {chat.sessionId} · 메시지 {chat.messages.length}건 ·{" "}
              {chat.stage || "대기"}. 조문은 팀 PDF 대조가 필요하며 법적 판단에
              사용하지 마세요.
            </p>
          </div>
        </section>
      )}
      <div className="product">
        <header className="app-header">
          <div className="brand">
            <span className="brand-icon" aria-hidden="true">
              <svg className="i" viewBox="0 0 24 24">
                <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </span>
            <div>
              <h1>작업장 안전기준 안내 챗봇</h1>
              <p>질문하면 관련 법령 기준을 안내합니다</p>
            </div>
          </div>
          <button
            id="new-chat"
            className="btn"
            onClick={() => {
              app.newChat();
              setText("");
              setValidation("");
              input.current?.focus();
            }}
          >
            ＋ 새 상담
          </button>
        </header>
        <div className="workspace">
          <aside className="sidebar" aria-label="이용 안내">
            <div className="side-inner">
              <div className="side-label">지원 범위와 질문 요령</div>
              <div className="side-text">{help}</div>
            </div>
          </aside>
          <main className="main" id="main" tabIndex={-1}>
            <details className="mobile-help">
              <summary>지원 범위와 질문 작성 안내</summary>
              <div className="mobile-help-body">{help}</div>
            </details>
            <div
              className="thread"
              role="log"
              aria-label="상담 대화"
              aria-live="polite"
            >
              {!chat.messages.length && (
                <section className="welcome">
                  <div className="eyebrow">작업장 안전기준 안내</div>
                  <h2>어떤 작업 상황이 궁금하신가요?</h2>
                  <p>장소와 작업 내용을 함께 적어 주세요.</p>
                  <ul className="welcome-tips">
                    <li>
                      예: “창고 2층 작업발판 끝에 안전난간을 설치하려고 해요.
                      높이 기준이 어떻게 되나요?”
                    </li>
                    <li>
                      {app.mode === "mock"
                        ? "답변의 근거 조문을 눌러 목업 원문을 확인할 수 있어요."
                        : "실제 근거 카드 연결은 서버 계약 보완 후 제공됩니다."}
                    </li>
                  </ul>
                </section>
              )}
              {chat.messages.map((m, i) =>
                m.role === "user" ? (
                  <div className="msg user" key={"u-" + i}>
                    <div className="who">
                      나 · {fmtTime(m.at)}{" "}
                      <button
                        className="linkbtn"
                        disabled={chat.busy}
                        onClick={() => edit(m.text)}
                      >
                        고쳐서 다시 묻기
                      </button>
                    </div>
                    <div className="bubble">{m.text}</div>
                  </div>
                ) : (
                  <div className="msg ai" key={m.result.runId}>
                    <div className="who">
                      <span className="ai-badge">AI 안내</span>
                      {fmtTime(m.result.at)}
                      {(review || app.mode === "live") &&
                        m.result.status !== "streaming" && (
                          <Link
                            className="trace-link"
                            to={
                              "/trace#run=" + encodeURIComponent(m.result.runId)
                            }
                          >
                            실행 기록 보기
                          </Link>
                        )}
                    </div>
                    <div className="card">
                      <AnswerCard
                        result={m.result}
                        disabled={chat.busy || i !== lastAI}
                        onSend={app.send}
                        onEdit={edit}
                        onLaw={setLaw}
                        onRetry={() =>
                          app.send(
                            [...chat.messages]
                              .slice(0, i)
                              .reverse()
                              .find((m) => m.role === "user")?.text || "",
                            { retry: true },
                          )
                        }
                      />
                    </div>
                  </div>
                ),
              )}
              {chat.busy && app.mode === "mock" && (
                <div className="msg ai pending-wrap">
                  <div className="card pending" role="status">
                    <span className="pulse" />
                    {
                      {
                        receive: "질문을 확인하고 있어요…",
                        classify: "주제를 확인하고 있어요…",
                        search: "관련 조문을 찾고 있어요…",
                        result: "답변을 정리하고 있어요…",
                      }[chat.stage]
                    }
                  </div>
                </div>
              )}
              <div ref={end} />
            </div>
            <div className="dock">
              {app.undoData && (
                <div className="toast" role="status">
                  <span>새 상담을 시작했어요.</span>
                  <button onClick={app.undo}>되돌리기</button>
                </div>
              )}
              <form className="composer" noValidate onSubmit={submit}>
                <label htmlFor="q" className="sr-only">
                  질문 입력
                </label>
                <textarea
                  id="q"
                  ref={input}
                  rows={1}
                  value={text}
                  placeholder="예: 계단 측면 안전난간 높이 기준"
                  aria-describedby="validation"
                  aria-invalid={!!validation}
                  onChange={(e) => {
                    setText(e.target.value);
                    setValidation("");
                  }}
                  onCompositionStart={() => (composing.current = true)}
                  onCompositionEnd={() => (composing.current = false)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing &&
                      !composing.current &&
                      e.keyCode !== 229
                    ) {
                      e.preventDefault();
                      submit(e);
                    }
                  }}
                />
                <button
                  type="submit"
                  className="send"
                  aria-label="보내기"
                  disabled={chat.busy}
                >
                  ↑
                </button>
              </form>
              <div className="dock-meta">
                <span id="validation" className="validation" role="alert">
                  {validation}
                </span>
                <span>
                  <span className="hint">
                    Enter 전송 · Shift + Enter 줄바꿈 ·{" "}
                  </span>
                  법령 원문 확인 후 적용하세요
                </span>
              </div>
            </div>
          </main>
        </div>
      </div>
      {law && (
        <LawPanel lawKey={law} onOpen={setLaw} onClose={() => setLaw(null)} />
      )}
    </>
  );
}
