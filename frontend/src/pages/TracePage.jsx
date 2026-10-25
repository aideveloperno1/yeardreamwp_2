import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useApp } from "../hooks/AppState.jsx";
import C from "../lib/evaluation.js";
import M from "../lib/mockData.js";
import { fmtTime, keys, read, session, validRuns } from "../lib/storage.js";
import { STATUS, statusKey, statusTone, stepsFor } from "../lib/trace.js";
import { NotFound, Page, Table, Tabs } from "../components/Common.jsx";
import {
  liveLabels,
  liveLabel,
  liveTone,
  liveStateKey,
} from "../lib/liveResult.js";
import RetrievedSources from "../components/RetrievedSources.jsx";
const origin = (r) =>
  r.mode === "live"
    ? "실제 API · 클라이언트 수신 기록"
    : r.evaluation
      ? "모의 평가"
      : r.source === "example"
        ? "고정 예시"
        : "브라우저 모의 상담";
const total = (r) =>
  r.evaluation || r.mode === "live"
    ? "미기록"
    : stepsFor(r).reduce((n, s) => n + s.ms, 0) + "ms (예시)";
function Tag({ run }) {
  return (
    <span
      className={
        "tag " +
        (run.mode === "live" ? liveTone(run) : statusTone[statusKey(run)] || "")
      }
    >
      {run.mode === "live"
        ? liveLabel(run)
        : STATUS[statusKey(run)] || "상태 미기록"}
    </span>
  );
}
export default function TracePage() {
  const { mode } = useApp();
  const loc = useLocation();
  const navigate = useNavigate();
  const [filter, setFilter] = useState({
    status: "",
    topic: "",
    session: "",
    error: false,
  });
  const stored = read(keys(mode).runs, [], validRuns);
  const ev =
    mode === "mock" ? C.load(session) : { data: C.blank(), warning: "" };
  const runs = [
    ...(mode === "mock"
      ? M.runs.map((r) => ({ ...r, source: "example" }))
      : []),
    ...stored.value,
    ...C.traces(ev.data),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const sessions = [...new Set(runs.map((r) => r.sessionId))];
  const params = new URLSearchParams(loc.hash.slice(1));
  const tab = params.has("session") ? "sessions" : "runs";
  const runId = params.has("run") ? params.get("run") : runs[0]?.id;
  const sessionId = params.has("session") ? params.get("session") : sessions[0];
  const run = runs.find((r) => r.id === runId);
  const selectedSession = runs
    .filter((r) => r.sessionId === sessionId)
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const shown = runs.filter(
    (r) =>
      (!filter.status ||
        (r.mode === "live" ? liveStateKey(r) : statusKey(r)) ===
          filter.status) &&
      (!filter.topic ||
        (filter.topic === "none" ? !r.topic : r.topic === filter.topic)) &&
      (!filter.session || r.sessionId === filter.session) &&
      (!filter.error || r.status === "error"),
  );
  return (
    <Page
      title="실행 추적·세션"
      description={
        mode === "mock"
          ? "브라우저 모의 기록과 고정 예시입니다. 단계·시간은 실측값이 아닙니다."
          : "현재 브라우저에 저장한 API 수신 기록입니다. 서버 추적 조회 API는 없습니다."
      }
    >
      {(stored.warning || ev.warning) && (
        <p className="note">{stored.warning || ev.warning}</p>
      )}
      <Tabs
        value={tab}
        onChange={(id) =>
          navigate(
            id === "runs"
              ? "/trace" + (runId ? "#run=" + encodeURIComponent(runId) : "")
              : "/trace#session=" + encodeURIComponent(sessionId || ""),
          )
        }
        tabs={[
          {
            id: "runs",
            label: "실행 기록",
            content: (
              <>
                <div className="filters">
                  {[
                    [
                      "status",
                      "결과",
                      Object.entries(mode === "live" ? liveLabels : STATUS),
                    ],
                    [
                      "topic",
                      "주제",
                      [...Object.entries(M.TOPICS), ["none", "주제 없음"]],
                    ],
                    ["session", "세션", sessions.map((s) => [s, s])],
                  ].map(([id, label, options]) => (
                    <label key={id} className="field">
                      {label}
                      <select
                        value={filter[id]}
                        onChange={(e) =>
                          setFilter((v) => ({ ...v, [id]: e.target.value }))
                        }
                      >
                        <option value="">전체</option>
                        {options.map(([key, name]) => (
                          <option key={key} value={key}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={filter.error}
                      onChange={(e) =>
                        setFilter((v) => ({ ...v, error: e.target.checked }))
                      }
                    />
                    오류만
                  </label>
                </div>
                <Table
                  heads={[
                    "실행 ID·출처",
                    "시각",
                    "질문",
                    "주제",
                    "결과",
                    "소요",
                  ]}
                  label="실행 기록"
                >
                  {shown.length ? (
                    shown.map((r) => (
                      <tr key={r.id} aria-selected={r.id === runId}>
                        <td>
                          <Link to={"/trace#run=" + encodeURIComponent(r.id)}>
                            {r.id}
                          </Link>
                          <br />
                          {origin(r)}
                        </td>
                        <td>{fmtTime(r.at)}</td>
                        <td>{r.question}</td>
                        <td>{M.TOPICS[r.topic] || "—"}</td>
                        <td>
                          <Tag run={r} />
                        </td>
                        <td>{total(r)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6}>조건에 맞는 실행이 없습니다.</td>
                    </tr>
                  )}
                </Table>
                <section className="card" aria-label="실행 상세">
                  {run ? <RunDetail run={run} /> : <NotFound what="기록" />}
                </section>
              </>
            ),
          },
          {
            id: "sessions",
            label: "세션 보기",
            content: (
              <>
                <Table
                  heads={["세션/평가 ID", "최근 시각", "실행 수", "최근 상태"]}
                  label="세션 목록"
                >
                  {sessions.map((s) => {
                    const rs = runs.filter((r) => r.sessionId === s);
                    return (
                      <tr key={s}>
                        <td>
                          <Link to={"/trace#session=" + encodeURIComponent(s)}>
                            {s}
                          </Link>
                        </td>
                        <td>{fmtTime(rs[0].at)}</td>
                        <td>{rs.length}</td>
                        <td>
                          <Tag run={rs[0]} />
                        </td>
                      </tr>
                    );
                  })}
                </Table>
                <section className="card">
                  {selectedSession.length ? (
                    <>
                      <h2>세션/평가 {sessionId}</h2>
                      {selectedSession.map((r) => (
                        <p key={r.id}>
                          {r.question} <Tag run={r} />{" "}
                          <Link to={"/trace#run=" + encodeURIComponent(r.id)}>
                            {r.id} 확인
                          </Link>
                        </p>
                      ))}
                    </>
                  ) : (
                    <NotFound what="세션" />
                  )}
                </section>
              </>
            ),
          },
        ]}
      />
    </Page>
  );
}
function RunDetail({ run: r }) {
  return (
    <>
      <h2>
        {r.id} <Tag run={r} />
      </h2>
      <dl className="law-meta">
        <dt>질문</dt>
        <dd>{r.question}</dd>
        <dt>세션/평가 ID</dt>
        <dd>{r.sessionId}</dd>
        <dt>출처</dt>
        <dd>{origin(r)}</dd>
        <dt>시각</dt>
        <dd>{fmtTime(r.at)}</dd>
        <dt>소요</dt>
        <dd>{total(r)}</dd>
      </dl>
      {r.mode === "live" && (
        <>
          <p className="note">
            이 ID는 브라우저가 만든 요청 ID입니다. 서버 실행 ID·Opik ID·실제
            검색 본문·단계 시간은 미제공입니다.
          </p>
          <p>
            {r.contract === "fixed-law-v1"
              ? "상담 법령 (당시 서버 계약 기준)"
              : "당시 화면의 법령 설정값 · 실제 검색 법령 확인 안 됨"}
            : {r.subject || "미기록"}
          </p>
          <p>
            수신 상태: {liveLabel(r)} · {r.reason}
          </p>
        </>
      )}
      <h3>
        {r.bodyVersion === 2 ? "저장한 답변 본문" : "이전 형식 답변 요약"}
      </h3>
      <p className="answer-body">{r.answer || "답변 미저장"}</p>
      {r.mode === "live" && <RetrievedSources result={r} />}
      {r.bodyVersion !== 2 && (
        <p className="note">
          이전 형식 · 일부 내용 미저장. 현재 예시로 누락 내용을 복원하지
          않습니다.
        </p>
      )}
      {r.evaluation ? (
        <>
          <h3>해당 모의 실행의 설정 {r.variant}</h3>
          <dl className="law-meta">
            {Object.entries(r.settings).map(([k, v]) => (
              <div className="meta-pair" key={k}>
                <dt>
                  {{
                    prompt: "프롬프트",
                    gen: "생성 모델",
                    emb: "임베딩 모델",
                    k: "검색 개수",
                    method: "검색 방식",
                    filter: "필터",
                    judge: "채점 기준",
                  }[k] || k}
                </dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <h3>예시 평가 점수</h3>
          <p>
            정확성 {r.scores.accuracy} / 근거 충실성 {r.scores.faithfulness}
          </p>
          <p>{r.reason}</p>
          <p className="note">
            검색 본문·단계 시간·실제 Opik ID는 미기록입니다.
          </p>
          <Link to="/evaluation">품질 평가로 돌아가기</Link>
        </>
      ) : (
        r.mode !== "live" && (
          <>
            <p className="note">
              아래 단계·모델·거리·시간은 목업 예시입니다. 실제 계측이나 Opik
              저장 사실을 뜻하지 않습니다.
            </p>
            <ol className="timeline">
              {stepsFor(r).map((s) => (
                <li className={s.state} key={s.key}>
                  <span className="dot" aria-hidden="true" />
                  <h3>
                    {s.label} · {s.ms}ms (예시)
                  </h3>
                  <p>{s.implNote}</p>
                  <ul>
                    {s.detail.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                    {s.tool && <li>{s.tool} (모의)</li>}
                  </ul>
                  {s.docs && (
                    <ul>
                      {s.docs.map((d) => (
                        <li key={d.docId}>
                          {d.article} {d.title} · 거리 {d.dist} (예시)
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          </>
        )
      )}
    </>
  );
}
