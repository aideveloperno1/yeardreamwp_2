import { validRetrievedSources } from "../lib/liveResult.js";
export class ApiError extends Error {
  constructor(message, status = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}
export async function errorMessage(response) {
  const fallback = [400, 422].includes(response.status)
    ? `요청 형식 확인 필요 (HTTP ${response.status})`
    : `서버 요청 실패 (HTTP ${response.status})`;
  try {
    const json = await response.json();
    if (typeof json?.detail === "string" && json.detail.trim())
      return json.detail;
    if (response.status === 422 && Array.isArray(json?.detail)) {
      const labels = { q: "질문", subject: "DB subject", file: "PDF 파일" };
      const fields = [
        ...new Set(
          json.detail.flatMap((item) => {
            const loc = item?.loc;
            const key = Array.isArray(loc) && loc[0] === "body" ? loc[1] : null;
            return Object.hasOwn(labels, key) ? [labels[key]] : [];
          }),
        ),
      ];
      if (fields.length)
        return `${fields.join("·")} 입력을 확인하세요. (HTTP 422)`;
    }
  } catch {
    // HTML, empty and malformed bodies keep a status-based message.
  }
  return fallback;
}
export async function streamChat({
  q,
  signal,
  onText = () => {},
  onSources = () => {},
  fetcher = fetch,
}) {
  const response = await fetcher("/ask/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/x-ndjson",
    },
    body: JSON.stringify({ q }),
    signal,
  });
  if (!response.ok)
    throw new ApiError(await errorMessage(response), response.status);
  if (
    response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase() !== "application/x-ndjson"
  ) {
    await response.body?.cancel();
    throw new ApiError(
      "서버 응답 형식이 맞지 않습니다. 서버와 화면의 버전을 확인하세요.",
    );
  }
  if (!response.body) throw new ApiError("응답 본문이 없습니다.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "";
  let buffer = "";
  let sources = null;
  let terminal = null;
  let drained = false;
  const invalid = () => {
    throw new ApiError(
      "서버 응답 형식이 올바르지 않습니다. 받은 내용이 있다면 일부 답변입니다.",
    );
  };
  const parse = (line) => {
    if (!line || terminal) invalid();
    let r;
    try {
      r = JSON.parse(line);
    } catch {
      invalid();
    }
    if (!r || r.v !== 1 || typeof r.type !== "string") invalid();
    if (r.type === "sources") {
      if (
        sources ||
        !["found", "no_results"].includes(r.search_status) ||
        !validRetrievedSources(r.items) ||
        (r.search_status === "found") !== r.items.length > 0
      )
        invalid();
      sources = { retrievedSources: r.items, searchStatus: r.search_status };
      onSources(sources);
    } else if (!sources) invalid();
    else if (r.type === "delta") {
      if (typeof r.text !== "string") invalid();
      text += r.text;
    } else if (r.type === "done") {
      if (
        !["completed", "incomplete", "unverified", "no_results"].includes(
          r.status,
        ) ||
        !(r.finish_reason === null || typeof r.finish_reason === "string") ||
        !text.trim() ||
        (r.status === "no_results") !==
          (sources.searchStatus === "no_results") ||
        (r.status === "no_results" && r.finish_reason !== null) ||
        (r.status === "completed" && r.finish_reason !== "stop") ||
        (r.status === "incomplete" &&
          !["length", "content_filter"].includes(r.finish_reason)) ||
        (r.status === "unverified" &&
          ["stop", "length", "content_filter"].includes(r.finish_reason))
      )
        invalid();
      terminal = r;
    } else if (r.type === "error") {
      if (
        !["code", "stage", "message"].every(
          (k) => typeof r[k] === "string" && r[k].trim(),
        )
      )
        invalid();
      terminal = r;
    } else invalid();
  };
  const consume = (value) => {
    const previousLength = text.length;
    buffer += value;
    try {
      let end;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end).replace(/\r$/, "");
        buffer = buffer.slice(end + 1);
        parse(line);
      }
    } finally {
      // A network read can contain many deltas. Persist/render once per read,
      // including valid text preceding a malformed record in that same read.
      if (text.length !== previousLength) onText(text);
    }
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      if (done) {
        drained = true;
        break;
      }
      consume(decoder.decode(value, { stream: true }));
      // The protocol terminal record ends this response. A proxy may leave
      // the HTTP body open after it; waiting for EOF would keep the UI busy.
      // consume still validates all records already received in this chunk.
      if (terminal) break;
    }
    consume(decoder.decode());
    if (buffer) invalid();
    if (!terminal)
      throw new ApiError(
        "종료 상태를 받지 못했습니다. 답변이 중간에 끊겼을 수 있습니다.",
      );
    if (terminal.type === "error") {
      const error = new ApiError(terminal.message);
      error.code = terminal.code;
      throw error;
    }
    return {
      text,
      ...sources,
      generationStatus: terminal.status,
      finishReason: terminal.finish_reason,
    };
  } finally {
    if (!drained) {
      try {
        await reader.cancel();
      } catch {
        /* connection already closed */
      }
    }
    reader.releaseLock();
  }
}
