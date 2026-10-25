import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useApp } from "../hooks/AppState.jsx";
import useEvaluation from "../hooks/useEvaluation.js";
import C from "../lib/evaluation.js";
import M from "../lib/mockData.js";
import { Page, Table, Tabs } from "../components/Common.jsx";
import LiveEvaluation from "../components/LiveEvaluation.jsx";
const f = (v) => (v === null ? "—" : v.toFixed(2));
const counts = (b) => {
  const c = C.counts(b);
  return `전체 ${c.total} · 예정 ${c.scheduled} · 완료 ${c.completed} · 실패 ${c.failed} · 제외 ${c.excluded} · 미처리 ${c.pending + c.running} · 완료율 ${c.completed}/${c.scheduled}`;
};
export default function EvaluationPage() {
  const { mode } = useApp();
  return (
    <Page
      title="품질 평가"
      description={
        mode === "live"
          ? "저장된 평가 결과를 조회합니다."
          : "모의 프롬프트·검색 설정의 전후 결과를 비교합니다."
      }
    >
      {mode === "live" ? <LiveEvaluation /> : <MockEvaluation />}
    </Page>
  );
}
function MockEvaluation() {
  const { trackEvaluation } = useApp();
  const { data, warning, busy, start, select } = useEvaluation();
  const [fail, setFail] = useState(false);
  const [tab, setTab] = useState("cases");
  useEffect(() => {
    trackEvaluation(busy);
    return () => trackEvaluation(false);
  }, [busy]);
  const { type, variant } = data.selection;
  const b = data.batches[type + ":" + variant];
  const a = data.batches[type + ":A"];
  const other = data.batches[type + ":B"];
  const setA = C.settings(type, "A"),
    setB = C.settings(type, "B");
  return (
    <>
      <p className="note">
        <strong>실제 Opik 평가가 아닌 모의 실행입니다.</strong> 자체 예시
        6문항의 답변·점수는 미리 작성한 값이며 시스템 성능의 증거가 아닙니다.
      </p>
      <form
        className="card"
        aria-busy={busy}
        onSubmit={(e) => {
          e.preventDefault();
          start(fail);
        }}
      >
        <h2>모의 평가 실행</h2>
        <p>데이터셋: {C.dataset} / 실행 예정 5건 / 제외 1건</p>
        <div className="filters">
          <label className="field">
            비교 유형
            <select
              value={type}
              disabled={busy}
              onChange={(e) => select({ type: e.target.value })}
            >
              <option value="prompt">프롬프트 개선 전후</option>
              <option value="retrieval">검색 방식 전후</option>
            </select>
          </label>
          <label className="field">
            실행 설정
            <select
              value={variant}
              disabled={busy}
              onChange={(e) => select({ variant: e.target.value })}
            >
              <option value="A">A (기준)</option>
              <option value="B">B (변경)</option>
            </select>
          </label>
          <button className="btn primary" type="submit" disabled={busy}>
            모의 평가 실행
          </button>
        </div>
        <details className="more">
          <summary>검토 도구 · 실패 재현</summary>
          <label className="check">
            <input
              type="checkbox"
              checked={fail}
              disabled={busy}
              onChange={(e) => setFail(e.target.checked)}
            />{" "}
            EX-03 모의 실패
          </label>
        </details>
        <p role="status">
          {b
            ? C.batchLabels[b.state] + " · " + b.id + " · " + counts(b)
            : "실행 전 · 전체 6건 / 예정 5건 / 제외 1건"}
        </p>
        <label htmlFor="eval-progress">
          처리 {b ? C.counts(b).completed + C.counts(b).failed : 0}/5
          (완료+실패)
        </label>{" "}
        <progress
          id="eval-progress"
          max={5}
          value={b ? C.counts(b).completed + C.counts(b).failed : 0}
        />
        <p className="muted">
          {warning ||
            "결과는 같은 탭에서 보관하며 탭을 닫으면 사라집니다. 실행 중 페이지를 떠나면 중단됩니다."}
        </p>
      </form>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          {
            id: "cases",
            label: "평가 사례",
            content: (
              <Table
                heads={[
                  "ID",
                  "유형",
                  "질문",
                  "기대 행동",
                  "예시 근거",
                  "실행 대상",
                ]}
                label="평가 사례"
              >
                {M.evalCases.map((c) => (
                  <tr key={c.id}>
                    <td>{c.id}</td>
                    <td>{c.type}</td>
                    <td>{c.q}</td>
                    <td>{c.expect}</td>
                    <td>{c.evidence}</td>
                    <td>
                      {c.id === "EX-06" ? "제외 · 근거 확인 필요" : "평가 예정"}
                    </td>
                  </tr>
                ))}
              </Table>
            ),
          },
          {
            id: "results",
            label: "결과",
            content: (
              <>
                <div className="grid-2">
                  {b ? (
                    Object.entries(C.metrics).map(([key, label]) => {
                      const agg = C.aggregate(b, key);
                      return (
                        <div className="card metric" key={key}>
                          <strong>{label}</strong>
                          <span>{f(agg.mean)}</span>
                          <small>유효 {agg.n}건 · 0~1, 높을수록 좋음</small>
                        </div>
                      );
                    })
                  ) : (
                    <p>모의 평가를 실행하면 점수가 표시됩니다.</p>
                  )}
                </div>
                <p className="note">
                  평균에는 유효 점수가 있는 완료 사례만 포함합니다.
                  0점·미측정·해당 없음은 구분하고 실패·제외는 따로 집계합니다.
                </p>
                <Table
                  heads={[
                    "ID·상태",
                    "질문·예시 답변",
                    "정확성",
                    "근거 충실성",
                    "요구사항 판정 (예시)",
                    "실행 기록",
                  ]}
                  label="사례별 판정"
                >
                  {b ? (
                    b.items.map((i) => (
                      <tr key={i.id}>
                        <td>
                          {i.id}
                          <br />
                          {C.statusLabels[i.state]}
                        </td>
                        <td>
                          {M.evalCases.find((c) => c.id === i.id).q}
                          <details>
                            <summary>예시 답변·판단 이유</summary>
                            <p className="answer-body">
                              {i.answer || "생성된 답변 없음"}
                            </p>
                            <p>{i.reason || "미처리"}</p>
                          </details>
                        </td>
                        {Object.keys(C.metrics).map((key) => (
                          <td key={key}>
                            {C.validScore(i.scores[key])
                              ? f(i.scores[key])
                              : i.metricNotes[key] || "미측정"}
                          </td>
                        ))}
                        <td>
                          {i.judgments
                            ? i.judgments.map((v, j) => (
                                <p key={j}>
                                  {M.judgeLabels[j]}:{" "}
                                  {v === "o"
                                    ? "○"
                                    : v === "x"
                                      ? "✕"
                                      : "해당 없음"}
                                </p>
                              ))
                            : "미평가"}
                        </td>
                        <td>
                          {i.runId && !warning ? (
                            <Link
                              to={"/trace#run=" + encodeURIComponent(i.runId)}
                            >
                              {i.runId}
                            </Link>
                          ) : i.runId ? (
                            "저장 불가 · 현재 답변만 확인 가능"
                          ) : (
                            "기록 미연결"
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6}>
                        선택한 유형·설정의 실행 결과가 없습니다.
                      </td>
                    </tr>
                  )}
                </Table>
              </>
            ),
          },
          {
            id: "compare",
            label: "전후 비교",
            content: (
              <>
                <p className="note">
                  {type === "prompt"
                    ? "프롬프트 v2에 조건·예외 보존 안내를 추가한 예시입니다. 다른 설정은 같습니다."
                    : "검색 방식만 다른 예시입니다. 프롬프트·모델·채점 기준은 같습니다."}{" "}
                  점수 차이는 실제 개선 효과를 입증하지 않습니다.
                </p>
                <Table
                  heads={["항목", "A (기준)", "B (변경)"]}
                  label="설정 비교"
                >
                  {[
                    ["프롬프트", "prompt"],
                    ["생성 모델", "gen"],
                    ["임베딩 모델", "emb"],
                    ["검색 방식", "method"],
                    ["검색 개수", "k"],
                    ["필터", "filter"],
                    ["채점 기준", "judge"],
                  ].map(([label, key]) => (
                    <tr key={key}>
                      <th>{label}</th>
                      <td>{setA[key]}</td>
                      <td>
                        {setB[key]}{" "}
                        {setA[key] !== setB[key] && (
                          <span className="tag info">변경</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </Table>
                <p className="note">
                  설정 A:{" "}
                  {a ? C.batchLabels[a.state] + " · " + counts(a) : "실행 전"} /
                  설정 B:{" "}
                  {other
                    ? C.batchLabels[other.state] + " · " + counts(other)
                    : "실행 전"}
                </p>
                <Table
                  heads={["지표", "A", "B", "B−A", "공통 유효문항"]}
                  label="점수 비교"
                >
                  {Object.entries(C.metrics).map(([key, label]) => {
                    const p = C.compare(a, other, key);
                    return (
                      <tr key={key}>
                        <th>{label}</th>
                        <td>{p ? f(p.a) : "비교 대기"}</td>
                        <td>{p ? f(p.b) : "비교 대기"}</td>
                        <td>
                          {p?.n ? (p.delta > 0 ? "+" : "") + f(p.delta) : "—"}
                        </td>
                        <td>{p ? p.n + "건" : "호환되는 A/B 결과 필요"}</td>
                      </tr>
                    );
                  })}
                </Table>
                <p className="muted">
                  동일 데이터셋·채점 기준의 지표별 공통 유효 문항만 비교합니다.
                  실행 중·중단 상태는 비교하지 않습니다.
                </p>
                {type === "retrieval" && (
                  <>
                    <h2>검색 지표 예시</h2>
                    <Table heads={["지표", "A", "B"]}>
                      {M.retrievalMetrics.labels.map((label, i) => (
                        <tr key={label}>
                          <th>{label}</th>
                          <td>
                            {a?.state === "completed"
                              ? M.retrievalMetrics.A[i]
                              : "미측정"}
                          </td>
                          <td>
                            {other?.state === "completed"
                              ? M.retrievalMetrics.B[i]
                              : "미측정"}
                          </td>
                        </tr>
                      ))}
                    </Table>
                    <p className="muted">
                      별도로 준비한 예시이며 위 답변 점수에서 계산하지 않습니다.
                      Hit@K: 상위 K개에 정답 조문이 든 비율. MRR: 정답 순위의
                      역수 평균. 전체 완료 때만 예시를 표시합니다.
                    </p>
                  </>
                )}
              </>
            ),
          },
        ]}
      />
    </>
  );
}
