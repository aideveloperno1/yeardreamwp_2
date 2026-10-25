import { Link } from "react-router";
import M from "../lib/mockData.js";
import C from "../lib/evaluation.js";
import { liveLabel, liveTone } from "../lib/liveResult.js";
import RetrievedSources from "./RetrievedSources.jsx";
export default function AnswerCard({
  result: r,
  disabled,
  onSend,
  onEdit,
  onLaw,
  onRetry,
}) {
  if (r.mode === "live")
    return (
      <>
        <div className="meta-row">
          <span className={"tag " + liveTone(r)}>{liveLabel(r)}</span>
          <span className="tag">실제 API</span>
        </div>
        <p className="answer-body">
          {r.text ||
            (r.status === "streaming"
              ? "서버 응답을 기다리고 있습니다…"
              : "받은 답변 없음")}
        </p>
        <p className="muted">
          {r.contract === "fixed-law-v1"
            ? `상담 법령 (당시 서버 계약 기준): ${r.subject}`
            : "이전 답변 · 실제 검색 법령 확인 안 됨"}
        </p>
        {r.note && <p className="note">{r.note}</p>}
        <RetrievedSources result={r} />
        <p className="muted">
          {r.generationStatus === "no_results" ? "AI 답변 생성 미호출 · " : r.generationStatus
            ? `모델 종료 사유: ${r.finishReason || "미확인"} · `
            : ""}
          검색 점수·단계 시간은 미제공입니다.
        </p>
        {r.status !== "streaming" && (
          <button className="btn" disabled={disabled} onClick={() => onEdit()}>
            질문 고쳐서 다시 묻기
          </button>
        )}
      </>
    );
  const chips = (values) => (
    <div className="followups">
      {values?.map((text) => (
        <button
          key={text}
          className="chip"
          disabled={disabled}
          onClick={() => onSend(text)}
        >
          {text}
        </button>
      ))}
    </div>
  );
  const list = (values = []) => (
    <ul>
      {values.map(([text, ref], i) => (
        <li key={i}>
          {text} {ref && <span className="ref">({ref})</span>}
        </li>
      ))}
    </ul>
  );
  if (r.status === "answer")
    return (
      <>
        <div className="meta-row">
          <span className="tag topic">주제 · {M.TOPICS[r.topic]}</span>
          <span className="tag">{r.placeTag}</span>
          <span className={"tag " + (r.conditional ? "warn" : "ok")}>
            {r.conditional ? "조건부 답변" : "답변 완료"}
          </span>
        </div>
        {r.conclusion && (
          <p className="conclusion">
            <b>결론</b>
            {r.conclusion}
          </p>
        )}
        <p className="summary">
          {r.summary}{" "}
          <button
            className="cite"
            aria-label="근거 1 조문 상세 보기"
            onClick={() => onLaw(r.sources?.[0])}
          >
            [1]
          </button>
        </p>
        <p className="explain">{r.explain}</p>
        {(r.contextNote || r.situation) && (
          <p className="situation">
            {r.contextNote} {r.situation}
          </p>
        )}
        <ul className="brief" aria-label="적용 조건, 예외, 안전조치 요약">
          {["적용 조건", "예외", "안전조치"].map((label, i) => (
            <li key={label} className={["cond", "exc", "act"][i]}>
              <b>{label}</b>
              <span>{r.brief?.[i]}</span>
            </li>
          ))}
        </ul>
        {r.limits && (
          <p className="limits">
            <b>판단 한계</b>
            {r.limits}
          </p>
        )}
        <details className="more">
          <summary>
            자세히 보기 <span>· 조건·예외·안전조치 전체와 근거 원문</span>
          </summary>
          <div className="more-body">
            {[
              ["conditions", "적용 조건"],
              ["exceptions", "예외"],
              ["actions", "안전조치"],
            ].map(([key, name]) => (
              <div className="sec" key={key}>
                <h4>{name}</h4>
                {list(r[key])}
              </div>
            ))}
            {r.sources
              ?.filter((k) => M.laws[k])
              .map((key, i) => {
                const law = M.laws[key];
                return (
                  <div className="source" key={key}>
                    <h4>
                      [{i + 1}] {M.LAW} {law.article}({law.title})
                    </h4>
                    <p>{M.EFFECTIVE}</p>
                    <p className="verify">
                      {law.verify || "기준 PDF 대조 필요"}
                    </p>
                    <blockquote>
                      {law.quote.map((p, j) => (
                        <p key={j}>{p}</p>
                      ))}
                    </blockquote>
                    <button className="btn" onClick={() => onLaw(key)}>
                      조문 상세 보기
                    </button>{" "}
                    <a href={law.url} target="_blank" rel="noopener noreferrer">
                      원문 보기 ↗
                    </a>
                    <p className="muted">{M.LINK_NOTE}</p>
                  </div>
                );
              })}
          </div>
        </details>
        <span className="muted">이어서 물어보기</span>
        {chips(r.followups)}
      </>
    );
  if (r.status === "clarify")
    return (
      <>
        <div className="meta-row">
          <span className="tag info">추가 정보 필요</span>
        </div>
        <div className="notice">
          <h3>{r.question}</h3>
          <p className="reason">
            {r.need}에 따라 적용 기준이 달라져요. 골라 주시거나 직접 입력해
            주세요.
          </p>
        </div>
        {chips(r.options)}
      </>
    );
  return (
    <>
      <div className="notice">
        <h3>
          {{
            hold: "확인된 근거가 없어 답변을 보류합니다.",
            out: "이 챗봇이 안내하지 않는 질문입니다.",
            unclassified:
              "어떤 작업장 안전기준에 대한 질문인지 판단하기 어려워요.",
            nodata:
              "지원 범위 안의 질문이지만, 이 목업에는 예시 답변이 없어요.",
            error: "요청을 처리하지 못했습니다.",
          }[r.status] || "결과 안내"}
        </h3>
        <p className="answer-body">{C.answerText(r)}</p>
      </div>
      {["error", "hold"].includes(r.status) && (
        <div className="actions">
          {r.status === "error" && (
            <button
              className="btn primary"
              disabled={disabled}
              onClick={onRetry}
            >
              다시 시도
            </button>
          )}
          <button
            className="btn"
            disabled={disabled}
            onClick={() => onEdit(r.askText)}
          >
            질문 고쳐서 다시 묻기
          </button>
        </div>
      )}
    </>
  );
}
