export const storage = (type) => ({
  getItem: (k) => window[type].getItem(k),
  setItem: (k, v) => window[type].setItem(k, v),
});
export const local = storage("localStorage");
export const session = storage("sessionStorage");
export const keys = (mode) =>
  mode === "live"
    ? { chat: "safety-chat.live.chat.v1", runs: "safety-chat.live.runs.v1" }
    : { chat: "mockup.chat.v1", runs: "mockup.runs.v1" };
export const freshChat = () => ({
  sessionId:
    "S-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 6),
  messages: [],
  pending: null,
  lastTopic: null,
  busy: false,
  stage: null,
  run: 0,
});
export function read(key, fallback, validate, store = local) {
  try {
    const raw = store.getItem(key);
    if (!raw) return { value: fallback, warning: "", blocked: false };
    const value = JSON.parse(raw);
    if (!validate(value)) throw Error("format");
    return { value, warning: "", blocked: false };
  } catch {
    return {
      value: fallback,
      warning:
        "저장 자료를 읽을 수 없습니다. 기존 자료는 보존하고 현재 화면에서만 진행합니다.",
      blocked: true,
    };
  }
}
export function write(key, value, store = local) {
  try {
    store.setItem(key, JSON.stringify(value));
    return "";
  } catch {
    return "브라우저 저장이 차단되었습니다. 현재 화면에서만 확인할 수 있습니다.";
  }
}
const topicNames = ["guardrail", "ladder", "fall", "opening"];
const sourceKeys = ["g13", "l24", "f42", "o43"];
const optionalText = (v) => v == null || typeof v === "string";
const validSources = (v) =>
  v == null || (Array.isArray(v) && v.every((k) => sourceKeys.includes(k)));
function validResult(r) {
  if (
    !r ||
    typeof r.runId !== "string" ||
    !validSources(r.sources) ||
    !optionalText(r.contract)
  )
    return false;
  if (
    ![
      "answer",
      "clarify",
      "hold",
      "out",
      "unclassified",
      "nodata",
      "error",
      "streaming",
      "received",
      "interrupted",
    ].includes(r.status)
  )
    return false;
  if (
    ![
      "conclusion",
      "summary",
      "explain",
      "contextNote",
      "situation",
      "limits",
      "question",
      "need",
      "reason",
      "text",
      "note",
      "askText",
      "placeTag",
      "original",
    ].every((k) => optionalText(r[k]))
  )
    return false;
  if (
    !["brief", "followups", "options"].every(
      (k) =>
        r[k] == null ||
        (Array.isArray(r[k]) && r[k].every((t) => typeof t === "string")),
    )
  )
    return false;
  return ["conditions", "exceptions", "actions"].every(
    (k) =>
      r[k] == null ||
      (Array.isArray(r[k]) &&
        r[k].every(
          (p) =>
            Array.isArray(p) && typeof p[0] === "string" && optionalText(p[1]),
        )),
  );
}
export function validChat(v) {
  return !!(
    v &&
    typeof v.sessionId === "string" &&
    (v.version == null || v.version === 1) &&
    (v.run == null || (Number.isSafeInteger(v.run) && v.run >= 0)) &&
    (v.lastTopic == null || topicNames.includes(v.lastTopic)) &&
    (v.pending == null ||
      (topicNames.includes(v.pending.topic) &&
        typeof v.pending.original === "string")) &&
    Array.isArray(v.messages) &&
    v.messages.every(
      (m) =>
        m &&
        ((m.role === "user" && typeof m.text === "string") ||
          (m.role === "ai" && validResult(m.result))),
    )
  );
}
export function restoreChat(mode) {
  const loaded = read(keys(mode).chat, freshChat(), validChat);
  const chat = { ...freshChat(), ...loaded.value, busy: false, stage: null };
  chat.messages = chat.messages.map((m) =>
    m.result?.status === "streaming"
      ? {
          ...m,
          result: {
            ...m.result,
            status: "interrupted",
            note: "화면 종료로 응답 수신이 중단되었습니다.",
          },
        }
      : m,
  );
  return { ...loaded, value: chat };
}
export function validRuns(v) {
  return (
    Array.isArray(v) &&
    v.every(
      (r) =>
        r &&
        typeof r.id === "string" &&
        typeof r.sessionId === "string" &&
        typeof r.question === "string" &&
        validSources(r.sources) &&
        ["answer", "reason", "subject", "need", "status", "contract"].every(
          (k) => optionalText(r[k]),
        ),
    )
  );
}
export function saveRun(run, mode) {
  const loaded = read(keys(mode).runs, [], validRuns);
  if (loaded.blocked) return loaded.warning;
  return write(
    keys(mode).runs,
    [...loaded.value.filter((r) => r.id !== run.id), run].slice(-60),
  );
}
export const fmtTime = (date) => {
  const d = new Date(date);
  return Number.isNaN(+d)
    ? ""
    : d.toLocaleString("ko-KR", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
};
