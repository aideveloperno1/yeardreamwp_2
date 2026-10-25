import { useState } from "react";
import { Link } from "react-router";
import M from "../lib/mockData.js";
import { Page, Table } from "../components/Common.jsx";
const KIND = {
  screen: "화면에서 확인",
  visual: "화면으로 시각화",
  backend: "백엔드 전용",
};
const scenarios = [
  [
    "정상 답변 → 근거 조문",
    [
      "상담에서 예시 안전난간 질문을 연다",
      "결론·조건·예외·안전조치를 확인한다",
      "근거 [1]로 옆 패널의 제13조를 본다",
      "조문 상세 페이지로 연다",
    ],
    "/chat?q=" + encodeURIComponent(M.examples[0].q),
  ],
  [
    "추가 질문 → 이어서 답변 → 실행 추적",
    [
      "추락 방지 예시를 열어 장소를 되묻는지 본다",
      "작업발판 끝·개구부 주변을 고른다",
      "검토 도구를 열고 실행 기록 보기를 누른다",
      "추적의 모의 단계와 미구현 표시를 확인한다",
    ],
    "/chat?q=" + encodeURIComponent(M.examples[2].q),
  ],
  [
    "오류 → 다시 시도 → 오류 기록",
    [
      "검토 도구에서 AI 응답 오류를 지정한다",
      "질문을 보내 오류 코드·실행 ID를 확인한다",
      "다시 시도로 정상 답변을 받는다",
      "실행 추적에서 오류만 필터를 켠다",
    ],
    "/chat",
  ],
  [
    "모의 평가 → 점수 → 비교",
    [
      "품질 평가에서 A를 실행한다",
      "B로 바꾸어 실행한다",
      "결과의 점수와 대표 실행 기록을 확인한다",
      "전후 비교의 공통 유효문항과 분모를 확인한다",
    ],
    "/evaluation",
  ],
];
const defaults = [
  ["기술 구성", "React·React Router·Vite", "기존 디자인·글꼴과 모의 기능 유지"],
  ["이전 상담", "실행 추적 안의 세션 보기", "사용자용 화면 범위 협의"],
  [
    "품질 평가",
    "자체 예시 모의 실행·A/B 비교",
    "실제 모드에서 지정된 단일 실험 결과 조회",
  ],
  [
    "실제 연결",
    "/ask/chat 텍스트 스트림·/upload·/admin/opik/results",
    "상담 법령 고정 · PDF 등록 법령 별도 설정",
  ],
  [
    "실제 추가 질문",
    "완결된 질문을 매번 전송",
    "문맥 지원 계약과 사례 검증 필요",
  ],
  ["기록 저장", "브라우저 모의/실제 분리", "서버 세션 저장은 미구현"],
  ["실행", "frontend에서 npm.cmd start", "실제 API에는 별도 FastAPI 실행 필요"],
];
export default function GuidePage() {
  const [kind, setKind] = useState("");
  const [open, setOpen] = useState(false);
  const pages = Object.fromEntries(M.pages.map((p) => [p.id, p]));
  const reqs = M.reqs.filter((r) => !kind || r.kind === kind);
  return (
    <Page
      title="작업장 안전기준 안내 챗봇 · 목업 안내"
      description="React 전환 결과, 시연 순서, 요구사항 대응과 남은 협의 항목입니다."
    >
      <p className="note">
        모의 모드의 답변·근거·평가·추적 수치는 예시입니다. 실제 모드는 서버가
        반환한 답변·등록 응답·저장된 평가 결과를 사용합니다. 55개 요구사항을
        전부 구현했다는 뜻은 아닙니다.
      </p>
      <section className="card">
        <h2>1. 페이지 지도</h2>
        <div className="page-cards">
          {M.pages
            .filter((p) => p.id !== "guide")
            .map((p) => (
              <Link key={p.id} className="page-card" to={"/" + p.id}>
                <span>{p.group}</span>
                <strong>{p.name}</strong>
                <span>{p.desc}</span>
              </Link>
            ))}
        </div>
      </section>
      <section className="card">
        <h2>2. 시연 시나리오 · 모의 모드에서 진행</h2>
        <div className="grid-3">
          {scenarios.map(([title, steps, to], i) => (
            <div className="card" key={title}>
              <h3>
                시나리오 {i + 1}. {title}
              </h3>
              <ol className="scenario">
                {steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              <p>
                <Link className="btn" to={to}>
                  시연 시작
                </Link>
              </p>
            </div>
          ))}
        </div>
      </section>
      <section className="card">
        <h2>3. 예시 질문으로 바로 열기</h2>
        <p className="muted">평가셋 문항이 아닌 자체 목업 질문입니다.</p>
        <div className="review-examples">
          {M.examples.map((e) => (
            <Link
              key={e.label}
              className="btn"
              to={"/chat?q=" + encodeURIComponent(e.q)}
            >
              {e.label} · {e.note}
            </Link>
          ))}
        </div>
      </section>
      <section className="card">
        <h2>4. 실제 서비스에서 각 화면</h2>
        <Table
          heads={["페이지", "누가 보나", "개발 중 쓰임", "실제 서비스에서"]}
        >
          {M.pages.map((p) => (
            <tr key={p.id}>
              <td>
                <Link to={"/" + p.id}>{p.name}</Link>
              </td>
              <td>{p.who}</td>
              <td>{p.dev}</td>
              <td>{p.live}</td>
            </tr>
          ))}
        </Table>
        <p className="note">
          내부 도구의 운영 방식·접근 권한은 아직 확정되지 않았습니다. 현재 개발
          화면이 로그인·권한을 구현한 것은 아닙니다.
        </p>
      </section>
      <section className="card">
        <h2>5. 회의에서 정할 것 · 기존 코드 검토 기준</h2>
        <Table heads={["안건", "백엔드 검토 기준", "목업/목표"]}>
          {M.agenda.map((row, i) => (
            <tr key={i}>
              {row.map((v, j) => (
                <td key={j}>{v}</td>
              ))}
            </tr>
          ))}
        </Table>
      </section>
      <section className="card">
        <h2>6. 현재 적용한 기본값</h2>
        <Table heads={["항목", "적용값", "남은 작업"]}>
          {defaults.map((row) => (
            <tr key={row[0]}>
              {row.map((v, i) => (
                <td key={i}>{v}</td>
              ))}
            </tr>
          ))}
        </Table>
      </section>
      <section className="card">
        <h2>7. 정의서 외 기능</h2>
        <Table heads={["기능", "위치", "관련 정의서·비고"]}>
          {M.extras.map((row, i) => (
            <tr key={i}>
              {row.map((v, j) => (
                <td key={j}>{v}</td>
              ))}
            </tr>
          ))}
        </Table>
      </section>
      <section className="card">
        <h2>8. 요구사항 대응표 (55개)</h2>
        <div className="filters" role="group" aria-label="구분 선택">
          {[["", "전체"], ...Object.entries(KIND)].map(([id, label]) => (
            <button
              className="btn"
              key={id}
              aria-pressed={kind === id}
              onClick={() => {
                setKind(id);
                setOpen(true);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="muted">
          {reqs.length}개 표시 ·{" "}
          {Object.entries(KIND)
            .map(
              ([key, label]) =>
                label + " " + M.reqs.filter((r) => r.kind === key).length,
            )
            .join(" · ")}
        </p>
        <details
          className="more"
          open={open}
          onToggle={(e) => setOpen(e.currentTarget.open)}
        >
          <summary>요구사항 목록 펼치기</summary>
          <div className="more-body">
            <Table heads={["ID", "분류", "요구사항", "구분", "보는 곳"]}>
              {reqs.map((r) => (
                <tr key={r.id}>
                  <td>
                    <code>{r.id}</code>
                  </td>
                  <td>{r.cat}</td>
                  <td>{r.name}</td>
                  <td className={"kind-" + r.kind}>{KIND[r.kind]}</td>
                  <td>
                    {pages[r.page] ? (
                      <Link to={"/" + r.page}>{pages[r.page].name}</Link>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          </div>
        </details>
      </section>
      <section className="card">
        <h2>9. 확인이 필요한 데이터</h2>
        <ul>
          {M.verifyList.map(([a, b], i) => (
            <li key={i}>
              <strong>{a}</strong> — {b}
            </li>
          ))}
        </ul>
        <p className="muted">
          기준 PDF 원문·조건·예외와 일치하는지 분석 담당과 검수해야 합니다.
        </p>
      </section>
    </Page>
  );
}
