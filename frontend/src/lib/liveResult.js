export const generationStates = [
  "pending",
  "streaming",
  "completed",
  "incomplete",
  "unverified",
  "no_results",
  "error",
  "cancelled",
];
export const searchStates = ["unknown", "found", "no_results"];
const nullableString = (v) => v === null || typeof v === "string";
export const validRetrievedSources = (items) =>
  Array.isArray(items) &&
  items.every(
    (s) =>
      s &&
      typeof s.source_id === "string" &&
      s.source_id.trim() &&
      ["law_name", "article_number", "article_title", "filename"].every((key) =>
        nullableString(s[key]),
      ) &&
      (s.chunk_index === null ||
        (Number.isSafeInteger(s.chunk_index) && s.chunk_index >= 0)),
  ) &&
  new Set(items.map((s) => s.source_id)).size === items.length;
export const validLiveFields = (r) =>
  (r.retrievedSources == null || validRetrievedSources(r.retrievedSources)) &&
  (r.searchStatus == null || searchStates.includes(r.searchStatus)) &&
  (r.generationStatus == null ||
    generationStates.includes(r.generationStatus)) &&
  (r.finishReason == null || typeof r.finishReason === "string");
export const liveStateKey = (r) =>
  r.status === "received" && r.generationStatus ? r.generationStatus : r.status;
export const liveLabels = {
  received: "응답 수신 종료",
  streaming: "응답 수신 중",
  interrupted: "수신 중단",
  error: "오류 종료",
  completed: "답변 생성 완료",
  incomplete: "생성 중단",
  unverified: "완료 여부 확인 불가",
  no_results: "검색 결과 없음",
};
export function liveLabel(r) {
  if (r.status === "error" && (r.text || r.answer || "").trim())
    return "오류 종료 · 일부 답변";
  if (r.status === "received" && r.generationStatus === "incomplete")
    return r.finishReason === "length" ? "길이 제한으로 중단" : "생성 중단";
  return liveLabels[liveStateKey(r)] || "상태 미기록";
}
export const liveTone = (r) =>
  r.status === "error"
    ? "err"
    : ["incomplete", "unverified", "interrupted"].includes(liveStateKey(r))
      ? "warn"
      : liveStateKey(r) === "completed"
        ? "ok"
        : "info";
