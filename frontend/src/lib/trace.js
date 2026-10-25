import M from "./mockData.js";
export const STATUS = {
  answer: "답변 완료",
  conditional: "조건부 답변",
  clarify: "추가 질문",
  hold: "답변 보류",
  out: "범위 밖",
  unclassified: "분류 불가",
  nodata: "예시 없음",
  error: "오류 종료",
};
export const statusKey = (r) =>
  r.status === "answer" && r.conditional ? "conditional" : r.status;
export const statusTone = {
  answer: "ok",
  conditional: "warn",
  clarify: "info",
  hold: "warn",
  out: "",
  unclassified: "warn",
  nodata: "info",
  error: "err",
};
const ERR = {
  llm: ["E504 · LLM_TIMEOUT", "AI 답변 생성 시간 초과"],
  search: ["E503 · SEARCH_UNAVAILABLE", "법령 검색 서버 연결 실패"],
};

/* 같은 실행 ID면 항상 같은 예시 소요시간 */
function msFor(id, i) {
  let h = 0;
  for (const c of id + ":" + i) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return 20 + (h % 380);
}

/* ── 단계 만들기: 예시 실행과 방금 한 상담에 같은 규칙 적용 ──
     단계 순서는 예시이며, 실제 순서는 백엔드 설계(REQ-026)에서 확정합니다. */
export function stepsFor(run) {
  const s = run.status,
    T = M.TOPICS,
    skipAll = ["out", "unclassified"].includes(s);
  const steps = [];
  const add = (key, label, impl, implNote, state, detail) =>
    steps.push({ key, label, impl, implNote, state, detail });
  add(
    "receive",
    "질문 접수",
    "partial",
    "현재 백엔드: 질문(q)을 받음 · 상담 법령 고정 · 세션 없음",
    "done",
    ["질문: " + run.question].concat(
      run.followUp ? ["추가 질문에 대한 답 — 앞선 질문과 연결 (REQ-028)"] : [],
      run.inherited ? ["주제 단어 없음 — 앞선 주제를 이어받음 (REQ-034)"] : [],
    ),
  );
  add("classify", "주제 분류", "missing", "REQ-008~011", "done", [
    run.topic
      ? "주제: " + T[run.topic]
      : s === "out"
        ? "지원 범위 밖"
        : s === "unclassified"
          ? "분류 불가"
          : s === "nodata"
            ? "범위 안 · 목업 예시 데이터 없음"
            : "주제 미확정",
  ]);
  add(
    "enough",
    "정보 충족 판단",
    "missing",
    "REQ-025",
    skipAll ? "skipped" : s === "clarify" ? "branch" : "done",
    [
      skipAll
        ? "분류 단계에서 종료"
        : s === "clarify"
          ? "부족한 정보: " +
            (run.need || "상황 정보") +
            " → 추가 질문으로 분기"
          : "충족",
    ],
  );
  const noSearch = skipAll || s === "clarify";
  add(
    "embed",
    "질문 벡터 변환 (임베딩)",
    "have",
    "현재: 임베딩 모델 이름이 코드에 고정",
    noSearch ? "skipped" : "done",
    [noSearch ? "검색하지 않음" : "임베딩 모델: " + M.models.emb],
  );
  const docs = (run.sources || []).map((k, i) => ({
    docId: M.laws[k].docId,
    article: M.laws[k].article,
    title: M.laws[k].title,
    dist: (0.18 + i * 0.06 + (msFor(run.id, 9) % 9) / 100).toFixed(2),
  }));
  if (docs.length) {
    const other = Object.keys(M.laws).find(
      (k) => !(run.sources || []).includes(k),
    );
    docs.push({
      docId: M.laws[other].docId,
      article: M.laws[other].article,
      title: M.laws[other].title,
      dist: "0.47",
    });
  }
  const searchErr = s === "error" && run.kind === "search";
  add(
    "search",
    "조문 검색",
    "partial",
    "현재: 상위 5개 · 법령명 필터만 · 점수 미반환(REQ-016)",
    noSearch ? "skipped" : searchErr ? "error" : "done",
    noSearch
      ? ["검색하지 않음"]
      : searchErr
        ? [
            ERR.search[1] + " (" + ERR.search[0] + ")",
            "검색 결과가 “없는” 것과 구분 (REQ-047)",
          ]
        : s === "hold"
          ? run.sources
            ? ["관련 조문은 찾았으나 질문에 답할 근거가 없음"]
            : ["검색 결과 없음 (REQ-017)"]
          : s === "nodata"
            ? ["실제 서비스라면 관련 조문 검색 · 목업에는 데이터 없음"]
            : [
                "검색 개수 5 · 필터: 법령명" +
                  (run.topic ? " + 주제(목표)" : ""),
              ],
  );
  if (docs.length && !searchErr && !noSearch)
    steps[steps.length - 1].docs = docs;
  const retries = s === "hold" ? 2 : 0;
  if (!noSearch)
    steps[steps.length - 1].tool =
      "조문 검색 도구 호출 " +
      (searchErr ? 1 : 1 + retries) +
      "회" +
      (retries ? " (재검색 " + retries + "회 포함)" : "");
  const afterErr = searchErr;
  add(
    "retry",
    "재검색",
    "missing",
    "REQ-029",
    noSearch || afterErr ? "skipped" : "done",
    [
      noSearch || afterErr
        ? "해당 없음"
        : s === "hold"
          ? "검색어 보완 후 재검색 2회 (상한 2회, 예시) — 근거 미확보"
          : "재검색 없음",
    ],
  );
  const llmErr = s === "error" && run.kind === "llm";
  const gen = {
    answer: run.conditional ? "조건부 답변 생성" : "답변 생성",
    clarify: "추가 질문 생성",
    hold: "보류 안내 생성",
    out: "범위 밖 안내",
    unclassified: "분류 불가 안내",
    nodata: "목업: 예시 없음 안내",
  }[s];
  add(
    "result",
    "결과 만들기",
    "partial",
    "현재: 답변 텍스트만 생성 (구조화 결과 REQ-023 미구현)",
    afterErr ? "skipped" : llmErr ? "error" : "done",
    afterErr
      ? ["검색 실패로 진행하지 않음"]
      : llmErr
        ? [ERR.llm[1] + " (" + ERR.llm[0] + ")"]
        : [
            gen +
              (run.sources
                ? " · 근거 " +
                  run.sources.map((k) => M.laws[k].article).join(", ")
                : ""),
          ].concat(run.reason ? [run.reason] : []),
  );
  {
    const r = steps[steps.length - 1];
    if (!afterErr) r.tool = "생성 모델 호출 1회 (" + M.models.gen + ")";
    if (run.answer && !afterErr && !llmErr) r.answer = run.answer;
  }
  add(
    "end",
    "상담 실행 종료",
    "missing",
    "REQ-030 · REQ-050",
    s === "error" ? "error" : "done",
    ["종료 상태: " + STATUS[statusKey(run)]].concat(
      s === "error"
        ? ["오류 코드 " + ERR[run.kind][0] + " · 실행 ID " + run.id + " 기록"]
        : [],
    ),
  );
  steps.forEach((st, i) => {
    st.ms =
      st.state === "skipped"
        ? 0
        : msFor(run.id, i) * (st.key === "result" ? 4 : 1);
  });
  // Opik: 분석가 2가 공유한 평가 실행 기록 범위(질문·답변·평가 결과·판정 이유)만 표시
  steps.forEach((st) => {
    st.opik = ["receive", "result"].includes(st.key)
      ? "yes"
      : st.state === "skipped"
        ? null
        : "tbd";
  });
  return steps;
}
