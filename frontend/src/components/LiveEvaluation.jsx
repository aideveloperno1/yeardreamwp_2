import { useEffect, useRef, useState } from "react";
import { fetchEvaluation } from "../services/evaluationClient.js";
import { Table } from "./Common.jsx";
export default function LiveEvaluation() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [at, setAt] = useState("");
  const [revision, refresh] = useState(0);
  const current = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    current.current = controller;
    setBusy(true);
    setError("");
    fetchEvaluation({ signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted || current.current !== controller) return;
        setData(result);
        setAt(new Date().toLocaleString("ko-KR"));
      })
      .catch((e) => {
        if (!controller.signal.aborted && current.current === controller)
          setError(e.message || "평가 조회 실패");
      })
      .finally(() => {
        if (!controller.signal.aborted && current.current === controller)
          setBusy(false);
      });
    return () => controller.abort();
  }, [revision]);
  const metrics = data
    ? [
        ...new Set([
          ...Object.keys(data.averages),
          ...data.results.flatMap((r) => Object.keys(r.scores)),
        ]),
      ]
    : [];
  return (
    <>
      <p className="note">
        서버에 지정된 단일 Opik 실험의 저장된 결과를 조회합니다. 평가 실행·실험
        선택·실제 전후 비교는 지원하지 않습니다.
      </p>
      <button
        className="btn"
        disabled={busy}
        onClick={() => refresh((v) => v + 1)}
      >
        평가 결과 새로고침
      </button>
      {busy && <p role="status">평가 결과 조회 중…</p>}
      {error && (
        <p role="alert">
          {error}
          {data ? " · 갱신 실패: 아래는 마지막 성공 조회 결과입니다." : ""}
        </p>
      )}
      {data && (
        <section aria-label="실제 평가 결과" aria-busy={busy}>
          <h2>{data.experiment_name || "이름 없는 실험"}</h2>
          <p>실험 ID: {data.experiment_id}</p>
          <p>
            조회 항목 수: {data.total} · 마지막 성공 조회: {at}
          </p>
          <p className="muted">
            최대 1,000개 조회 기준이며 전체 데이터셋 크기와 다를 수 있습니다.
            점수는 서버 원래 척도로 표시하며 높을수록 좋다는 의미로 해석하지
            않습니다.
          </p>
          {metrics.length ? (
            <Table
              label="실제 지표 요약"
              heads={["지표", "서버 평균", "조회 결과 중 점수 있는 항목 수"]}
            >
              {metrics.map((name) => (
                <tr key={name}>
                  <th>{name}</th>
                  <td>
                    {Object.hasOwn(data.averages, name)
                      ? String(data.averages[name])
                      : "미측정"}
                  </td>
                  <td>
                    {
                      data.results.filter((r) => Object.hasOwn(r.scores, name))
                        .length
                    }
                    건
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <p>조회된 평가 점수가 없습니다.</p>
          )}
          <p className="muted">
            점수 있는 항목 수는 문항별 응답에서 집계하며 서버 평균의 분모를
            확정하는 값은 아닙니다. 평가자·점수 사유는 미제공입니다.
          </p>
          {data.results.length ? (
            <Table label="실제 질문별 점수" heads={["순번", "질문", "점수"]}>
              {data.results.map((r, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{r.question || "질문 미제공"}</td>
                  <td>
                    {Object.entries(r.scores).length
                      ? Object.entries(r.scores).map(([name, value]) => (
                          <p key={name}>
                            {name}: {String(value)}
                          </p>
                        ))
                      : "미측정"}
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <p>조회된 평가 항목이 없습니다.</p>
          )}
        </section>
      )}
    </>
  );
}
