import { useState } from "react";
import { Link } from "react-router";
import { useApp } from "../hooks/AppState.jsx";
import M from "../lib/mockData.js";
import { Badge, Page, Table, Tabs } from "../components/Common.jsx";
export default function DocumentsPage() {
  const app = useApp();
  const [tab, setTab] = useState("upload");
  const [lawName, setLawName] = useState(M.LAW);
  const [file, setFile] = useState(null);
  const [force, setForce] = useState("");
  const [replace, setReplace] = useState(false);
  const busy = app.upload?.state === "running";
  const result = app.upload?.mode === app.mode ? app.upload : null;
  const columns = [
    ["docId", "문서 ID"],
    ["law", "법령명"],
    ["article", "조문"],
    ["title", "제목"],
    ["chunks", "조각 수"],
    ["effective", "시행일"],
    ["version", "버전"],
    ["page", "출처 쪽"],
    ["embedModel", "임베딩 모델"],
    ["loadState", "상태"],
    ["integrity", "조건·예외·참조 유지"],
  ];
  const list = (
    <>
      <p className="note">
        <strong>고정 예시 목록입니다.</strong> 모의·실제 등록 결과를 조회한
        목록이 아닙니다. 문서 조회 API는 현재 없습니다. 1,500자를 넘는 조문은
        겹침 200자로 추가 분할하므로 조건·예외가 다른 조각에 갈라질 수 있습니다.
      </p>
      <Table
        heads={columns.map(([, label]) => label)}
        label="고정 예시 문서 목록"
      >
        {M.documents.map((d) => (
          <tr key={d.docId + d.title}>
            <td>
              <code>{d.docId}</code>
            </td>
            <td>{M.LAW}</td>
            <td>
              {d.key ? (
                <Link to={"/law?id=" + d.key}>{d.article}</Link>
              ) : (
                d.article
              )}
              {d.example && <Badge>예시 행</Badge>}
            </td>
            <td>{d.title}</td>
            <td>{d.chunks}</td>
            <td>
              {d.example && d.state === "결측으로 분리"
                ? "누락"
                : "2026. 3. 2."}
            </td>
            <td>제450호</td>
            <td>{d.key ? M.laws[d.key].page : "—"}</td>
            <td>{M.models.emb}</td>
            <td>
              <span className={"tag " + (d.state === "적재" ? "ok" : "warn")}>
                {d.state}
              </span>
            </td>
            <td>{d.integrity}</td>
          </tr>
        ))}
      </Table>
      <p className="muted">
        위 열의 실제 저장 지원:{" "}
        {columns
          .map(
            ([key, label]) =>
              label +
              " " +
              (M.fieldStatus[key] === "have" ? "코드에 있음" : "미구현"),
          )
          .join(" / ")}
      </p>
    </>
  );
  return (
    <Page
      title="법령 RAG 관리"
      description="법령 PDF 등록과 적재 결과를 확인합니다."
    >
      <p className="note">
        {app.mode === "mock"
          ? "관리자용 목업입니다. PDF를 실제로 읽거나 저장하지 않습니다."
          : "실제 /upload를 호출합니다. 같은 subject의 기존 청크를 교체하며, 같은 파일명은 거절될 수 있습니다. 다른 법령을 등록해도 상담 대상(산업안전보건기준에 관한 규칙)은 바뀌지 않습니다. 현재 인증·등록 이력 조회 API는 없습니다."}
      </p>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          {
            id: "upload",
            label: "PDF 등록",
            content: (
              <>
                <form
                  className="card"
                  aria-busy={busy}
                  onSubmit={(e) => {
                    e.preventDefault();
                    app.register({
                      file,
                      lawName: app.mode === "live" ? app.subject : lawName,
                      force: app.mode === "mock" ? force : "",
                    });
                  }}
                >
                  <h2>
                    {app.mode === "mock" ? "모의 PDF 등록" : "실제 PDF 등록"}
                  </h2>
                  <div className="filters">
                    <label className="field">
                      {app.mode === "live"
                        ? "등록 법령명 (DB subject)"
                        : "등록 법령명"}
                      <input
                        value={app.mode === "live" ? app.subject : lawName}
                        disabled={busy}
                        onChange={(e) =>
                          app.mode === "live"
                            ? app.configureSubject(e.target.value)
                            : setLawName(e.target.value)
                        }
                      />
                    </label>
                    <label className="field">
                      PDF 파일
                      <input
                        type="file"
                        accept=".pdf,application/pdf"
                        disabled={busy}
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                      />
                    </label>
                    {app.mode === "mock" && (
                      <label className="field">
                        검토용 실패 지정
                        <select
                          value={force}
                          disabled={busy}
                          onChange={(e) => setForce(e.target.value)}
                        >
                          <option value="">자동</option>
                          {M.uploadErrors
                            .filter((e) =>
                              ["no-text", "no-article"].includes(e.id),
                            )
                            .map((e) => (
                              <option key={e.id} value={e.id}>
                                {e.label}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}
                    <button
                      type="submit"
                      className="btn primary"
                      disabled={
                        busy ||
                        (app.mode === "live" &&
                          (!replace || !app.subject.trim()))
                      }
                    >
                      {busy
                        ? "처리 중…"
                        : app.mode === "mock"
                          ? "모의 등록"
                          : "서버에 등록"}
                    </button>
                  </div>
                  {app.mode === "live" ? (
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={replace}
                        disabled={busy}
                        onChange={(e) => setReplace(e.target.checked)}
                      />
                      같은 subject의 기존 청크가 교체되는 것을 확인했습니다.
                    </label>
                  ) : (
                    <p className="muted">
                      같은 이름 실패 예시 파일: {M.pdfFile}
                    </p>
                  )}
                </form>
                <div aria-live="polite">
                  {result && (
                    <div
                      className={
                        "result-box " +
                        (result.state === "success"
                          ? "ok"
                          : result.state === "error"
                            ? "err"
                            : "info")
                      }
                    >
                      <h3>
                        {
                          {
                            running: "등록 처리 중…",
                            success:
                              app.mode === "mock"
                                ? "모의 등록 완료"
                                : "등록 응답 수신",
                            error: "등록 실패",
                            unknown: "결과 확인 필요",
                          }[result.state]
                        }
                      </h3>
                      <p>
                        {result.message ||
                          (result.state === "unknown"
                            ? "이전 요청의 서버 최종 결과를 확인하지 못했습니다. 재시도 전에 파일과 색인 상태를 확인하세요."
                            : "모의 모드는 실제 PDF를 읽지 않습니다. 실제 요청은 서버 응답을 기다립니다.")}
                      </p>
                      {result.filename && (
                        <p>
                          {result.subject} · {result.filename}
                        </p>
                      )}
                      {result.state === "unknown" && (
                        <p>
                          자동 재시도하지 않습니다. 요청을 중단해도 서버
                          저장·색인이 취소되었다고 볼 수 없습니다.
                        </p>
                      )}
                    </div>
                  )}
                </div>
                {app.uploadWarning && (
                  <p className="note">{app.uploadWarning}</p>
                )}
                <div className="card">
                  <h2>실패 경우 6가지 · 코드 검토 기준</h2>
                  <Table heads={["경우", "안내 문구", "발생 위치"]}>
                    {M.uploadErrors.map((e) => (
                      <tr key={e.id}>
                        <td>{e.label}</td>
                        <td>{e.api}</td>
                        <td>{e.where}</td>
                      </tr>
                    ))}
                  </Table>
                  <p className="note">
                    PDF 저장 후 색인 실패 시 잔여 파일 때문에 같은 이름으로 다시
                    등록하지 못할 수 있습니다. 서버의 모든 내부 오류가 이 표처럼
                    구체적으로 반환되지는 않습니다.
                  </p>
                </div>
              </>
            ),
          },
          {
            id: "list",
            label: "문서 목록 (예시)",
            content:
              app.mode === "mock" ? (
                list
              ) : (
                <p className="note">
                  실제 문서 목록 조회 API 미지원입니다. 모의 모드에서 고정 예시
                  표를 검토할 수 있습니다.
                </p>
              ),
          },
          {
            id: "check",
            label: "데이터 점검 (예시)",
            content:
              app.mode === "mock" ? (
                <div className="grid-2">
                  <div className="card">
                    <h2>필수 정보가 빠진 문서 · REQ-038</h2>
                    <p>제○조 (예시 행) — 시행일 누락 → 검색 대상에서 분리</p>
                    <Badge kind="missing" />
                    <p>현재 코드는 필수 정보 검사가 없습니다.</p>
                  </div>
                  <div className="card">
                    <h2>중복 문서 · REQ-042</h2>
                    <p>OSHR-013 같은 문서 ID·버전 재등록 → 적재 제외 (목표)</p>
                    <p className="note">
                      현재 코드는 같은 법령명이면 통째로 교체합니다. 정의서의
                      문서 ID·버전 단위와 다릅니다. 임베딩 모델 변경 시 재적재도
                      협의해야 합니다.
                    </p>
                  </div>
                  <div className="card">
                    <h2>별표·참조 자료 연결 · REQ-043</h2>
                    <Table heads={["조문", "참조 조문", "별표"]}>
                      {Object.values(M.laws).map((l) => (
                        <tr key={l.docId}>
                          <td>{l.article}</td>
                          <td>
                            {l.refs
                              .map((r) => M.laws[r.key]?.article)
                              .join(", ") || "—"}
                          </td>
                          <td>없음</td>
                        </tr>
                      ))}
                    </Table>
                    <p>예시 조문 4개 외 별표는 PDF 확인 후 추가합니다.</p>
                  </div>
                  <div className="card">
                    <h2>민원 사례 개인정보 점검 · REQ-039·044</h2>
                    <ul>
                      {M.piiChecks.map((c) => (
                        <li key={c.id}>
                          {c.id} {c.summary} — {c.state}
                        </li>
                      ))}
                    </ul>
                    <p className="muted">
                      실제 민원 자료를 외부 AI로 보내기 전 비식별 처리가
                      필요합니다. <Link to="/evaluation">품질 평가</Link>
                    </p>
                  </div>
                </div>
              ) : (
                <p className="note">실제 데이터 점검 API는 미지원입니다.</p>
              ),
          },
        ]}
      />
    </Page>
  );
}
