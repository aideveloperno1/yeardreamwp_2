import { createContext, useContext, useEffect, useRef, useState } from "react";
import C from "../lib/evaluation.js";
import M from "../lib/mockData.js";
import { decideMock } from "../lib/chatRules.js";
import {
  freshChat,
  keys,
  read,
  restoreChat,
  saveRun,
  session,
  write,
} from "../lib/storage.js";
import { streamChat } from "../services/chatClient.js";
import { uploadDocument } from "../services/documentClient.js";
import { CHAT_LAW, CHAT_CONTRACT } from "../lib/liveContract.js";
const Context = createContext(null);
export const useApp = () => useContext(Context);
const copy = (v) => structuredClone(v);
const uploadKey = "safety-chat.live.upload.v1";
const connection = __API_CONNECTION__;

export function AppProvider({ children }) {
  const [initial] = useState(() => {
    const live = restoreChat("live");
    if (live.value.messages.length && !live.value.contract) {
      live.warning ||=
        "이전 대화를 복원했습니다. 과거 법령 설정은 실제 검색 법령을 보장하지 않으며 새 질문부터 고정 법령이 적용됩니다.";
    }
    return { mock: restoreChat("mock"), live };
  });
  const [chats, setChats] = useState(() => ({
    mock: initial.mock.value,
    live: initial.live.value,
  }));
  const chatsRef = useRef(chats);
  const [mode, setMode] = useState("mock");
  const modeRef = useRef("mock");
  const [subject, setSubject] = useState(
    () =>
      import.meta.env.VITE_RAG_SUBJECT ||
      read("safety-chat.upload-subject.v1", "", (v) => typeof v === "string")
        .value ||
      (!initial.live.value.contract ? initial.live.value.subject : "") ||
      "",
  );
  const [warning, setWarning] = useState(initial.mock.warning);
  const [evaluationBusy, setEvaluationBusy] = useState(false);
  const evaluationBusyRef = useRef(false);
  const trackEvaluation = (value) => {
    evaluationBusyRef.current = value;
    setEvaluationBusy(value);
  };
  const [override, setOverride] = useState("auto");
  const [undoData, setUndo] = useState(null);
  const undoTimer = useRef(null);
  const active = useRef(null);
  const uploadActive = useRef(false);
  const mockUploadTimer = useRef(null);
  const [uploadLoaded] = useState(() =>
    read(
      uploadKey,
      null,
      (v) =>
        v === null ||
        (typeof v.filename === "string" &&
          typeof v.subject === "string" &&
          ["running", "success", "error", "unknown"].includes(v.state)),
      session,
    ),
  );
  const [upload, setUpload] = useState(() =>
    uploadLoaded.value
      ? {
          ...uploadLoaded.value,
          state:
            uploadLoaded.value.state === "running"
              ? "unknown"
              : uploadLoaded.value.state,
        }
      : null,
  );
  const [uploadWarning, setUploadWarning] = useState(uploadLoaded.warning);
  const update = (m, fn) => {
    const next = fn(chatsRef.current[m]);
    chatsRef.current = { ...chatsRef.current, [m]: next };
    setChats(chatsRef.current);
    if (!initial[m].blocked) {
      const w = write(keys(m).chat, next);
      if (w) setWarning(w);
    }
  };
  const record = (m, chat, result, question, opts = {}) => {
    const r = {
      id: result.runId,
      sessionId: chat.sessionId,
      at: result.at,
      question,
      bodyVersion: 2,
      status: result.status,
      topic: result.topic || null,
      conditional: !!result.conditional,
      need: result.need || null,
      sources: result.sources || null,
      kind: result.kind || null,
      reason: result.reason || result.note || null,
      answer: m === "mock" ? C.answerText(result) : result.text || "",
      followUp: !!chat.pending,
      inherited: !!result.contextNote?.includes("앞선 주제"),
      retry: !!opts.retry,
      mode: m,
      ...(m === "live"
        ? {
            subject: result.subject || chat.subject,
            contract: result.contract,
            connectionId: chat.connection || connection,
            clientRequestId: result.runId,
            receiveState: result.status,
            retrievedSources: result.retrievedSources,
            searchStatus: result.searchStatus,
            generationStatus: result.generationStatus,
            finishReason: result.finishReason,
          }
        : {}),
    };
    const w = saveRun(r, m);
    if (w) setWarning(w);
  };
  function cancelChat(note = "화면 이동으로 응답 수신을 중단했습니다.") {
    const a = active.current;
    if (!a) return;
    active.current = null;
    a.controller?.abort();
    a.timers?.forEach(clearTimeout);
    const old = chatsRef.current[a.mode];
    if (a.mode === "live") {
      const result = {
        ...a.result,
        status: "interrupted",
        generationStatus: "cancelled",
        text: a.text || "",
        note,
      };
      update(a.mode, (s) => ({
        ...s,
        busy: false,
        stage: null,
        messages: s.messages.map((m) =>
          m.result?.runId === a.id ? { ...m, result } : m,
        ),
      }));
      record(a.mode, old, result, a.question);
    } else update(a.mode, (s) => ({ ...s, busy: false, stage: null }));
  }
  async function send(text, opts = {}) {
    const q = text.trim();
    const m = modeRef.current;
    if (!q || active.current) return false;
    clearTimeout(undoTimer.current);
    setUndo(null);
    const old = copy(chatsRef.current[m]);
    const next = {
      ...old,
      subject: m === "live" ? CHAT_LAW : M.LAW,
      ...(m === "live" ? { connection, contract: CHAT_CONTRACT } : {}),
      busy: true,
      stage: "receive",
      messages: [
        ...old.messages,
        { role: "user", text: q, at: new Date().toISOString() },
      ],
    };
    update(m, () => next);
    if (m === "mock") {
      const work = copy(next);
      const result = decideMock(work, q, override === "auto" ? null : override);
      setOverride("auto");
      const a = { id: result.runId, mode: m, timers: [] };
      active.current = a;
      ["classify", "search", "result"].forEach((stage, i) =>
        a.timers.push(
          setTimeout(
            () => {
              if (active.current === a) update(m, (s) => ({ ...s, stage }));
            },
            240 + i * 260,
          ),
        ),
      );
      a.timers.push(
        setTimeout(() => {
          if (active.current !== a) return;
          active.current = null;
          update(m, (s) => ({
            ...s,
            run: work.run,
            busy: false,
            stage: null,
            lastQuestion: q,
            pending:
              result.status === "clarify"
                ? { topic: result.topic, original: result.original }
                : result.status === "error"
                  ? old.pending
                  : null,
            lastTopic: ["out", "nodata", "unclassified"].includes(result.status)
              ? null
              : result.topic || old.lastTopic,
            messages: [...s.messages, { role: "ai", result }],
          }));
          record(m, old, result, q, opts);
        }, 1250),
      );
      return true;
    }
    const id =
      "CLIENT-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 8);
    const result = {
      runId: id,
      status: "streaming",
      searchStatus: "unknown",
      generationStatus: "pending",
      retrievedSources: null,
      finishReason: null,
      at: new Date().toISOString(),
      text: "",
      mode: "live",
      subject: CHAT_LAW,
      contract: CHAT_CONTRACT,
    };
    const a = {
      id,
      mode: m,
      question: q,
      controller: new AbortController(),
      result,
      text: "",
    };
    active.current = a;
    update(m, (s) => ({
      ...s,
      messages: [...s.messages, { role: "ai", result }],
    }));
    const patch = (changes) => {
      a.result = { ...a.result, ...changes };
      update(m, (s) => ({
        ...s,
        messages: s.messages.map((msg) =>
          msg.result?.runId === id
            ? { ...msg, result: { ...msg.result, ...changes } }
            : msg,
        ),
      }));
    };
    try {
      const response = await streamChat({
        q,
        signal: a.controller.signal,
        onSources: (sources) => {
          if (active.current === a) patch(sources);
        },
        onText: (text) => {
          if (active.current === a) {
            a.text = text;
            patch({ text, generationStatus: "streaming" });
          }
        },
      });
      if (active.current !== a) return true;
      const final = {
        ...a.result,
        ...response,
        status: "received",
        note:
          response.generationStatus === "completed"
            ? "서버가 답변 생성을 마쳤습니다. 법령 내용의 정확성을 보장하는 표시는 아닙니다."
            : response.generationStatus === "no_results"
              ? "검색 결과가 없어 AI 답변을 생성하지 않았습니다."
              : response.generationStatus === "incomplete"
                ? "답변 생성이 중단되었습니다. 받은 내용이 완전하지 않을 수 있습니다."
                : "답변은 수신했지만 모델의 완료 사유를 확인하지 못했습니다.",
      };
      patch(final);
      record(m, next, final, q);
    } catch (e) {
      if (active.current !== a) return true;
      const final = {
        ...a.result,
        status: e.name === "AbortError" ? "interrupted" : "error",
        generationStatus: e.name === "AbortError" ? "cancelled" : "error",
        text: a.text,
        note: e.message || "연결 오류",
        kind: "api",
      };
      patch(final);
      record(m, next, final, q);
    } finally {
      if (active.current === a) {
        active.current = null;
        update(m, (s) => ({ ...s, busy: false, stage: null }));
      }
    }
    return true;
  }
  function newChat() {
    cancelChat("새 상담을 시작해 응답 수신을 중단했습니다.");
    const m = modeRef.current;
    const previous = copy(chatsRef.current[m]);
    clearTimeout(undoTimer.current);
    setUndo(previous.messages.length ? { mode: m, state: previous } : null);
    update(m, () => ({
      ...freshChat(),
      subject: m === "live" ? CHAT_LAW : M.LAW,
      ...(m === "live" ? { connection, contract: CHAT_CONTRACT } : {}),
    }));
    undoTimer.current = setTimeout(() => setUndo(null), 6000);
  }
  function undo() {
    if (!undoData || undoData.mode !== modeRef.current || active.current)
      return;
    clearTimeout(undoTimer.current);
    update(undoData.mode, () => ({
      ...undoData.state,
      busy: false,
      stage: null,
    }));
    setUndo(null);
  }
  function changeMode(value) {
    if (
      active.current ||
      uploadActive.current ||
      evaluationBusyRef.current ||
      !["mock", "live"].includes(value)
    )
      return;
    setMode(value);
    modeRef.current = value;
    setOverride("auto");
    setUndo(null);
    setWarning(initial[value].warning);
  }
  function configureSubject(value) {
    if (active.current || uploadActive.current || evaluationBusyRef.current)
      return;
    const next = value.trim();
    if (next !== subject) {
      setSubject(next);
      const w = write("safety-chat.upload-subject.v1", next);
      if (w) setWarning(w);
    }
  }
  async function register({ file, lawName, force }) {
    if (uploadActive.current) return;
    const m = modeRef.current;
    const fail = (message) => {
      setUpload({ mode: m, state: "error", message });
    };
    if (!file) return fail("PDF 파일을 선택하세요.");
    if (!file.name.toLowerCase().endsWith(".pdf"))
      return fail("PDF 파일만 업로드할 수 있습니다.");
    if (!lawName.trim())
      return fail(
        m === "live"
          ? "실제 DB subject를 설정하세요."
          : "법령명을 입력해주세요.",
      );
    if (m === "mock" && file.name === M.pdfFile)
      return fail("같은 이름의 파일이 이미 있습니다. (모의 오류)");
    uploadActive.current = true;
    const meta = {
      mode: m,
      subject: lawName.trim(),
      filename: file.name,
      state: "running",
      at: new Date().toISOString(),
    };
    setUpload(meta);
    if (m === "live")
      setUploadWarning(uploadLoaded.warning || write(uploadKey, meta, session));
    let end;
    try {
      if (m === "mock") {
        await new Promise((resolve) => {
          mockUploadTimer.current = setTimeout(resolve, 650);
        });
        if (force)
          throw Error(
            M.uploadErrors.find((e) => e.id === force)?.api || "모의 등록 오류",
          );
        end = {
          ...meta,
          state: "success",
          message: "모의 등록 완료 · 조문 24개 / 청크 31개 / 교체 0개 (예시)",
        };
      } else {
        const data = await uploadDocument({ subject: lawName.trim(), file });
        end = {
          ...meta,
          state: "success",
          message:
            "서버 등록 응답: " +
            data.upload.join(", ") +
            " · 조문/청크 수는 미제공",
        };
      }
    } catch (e) {
      const unknown = m === "live" && (!e.status || e.status >= 500);
      end = {
        ...meta,
        state: unknown ? "unknown" : "error",
        message:
          e.message +
          (unknown ? " · 서버 처리 결과와 잔여 파일을 확인하세요." : ""),
      };
    } finally {
      uploadActive.current = false;
    }
    setUpload(end);
    if (m === "live")
      setUploadWarning(uploadLoaded.warning || write(uploadKey, end, session));
  }
  useEffect(() => {
    const hide = () => cancelChat("화면 종료로 응답 수신을 중단했습니다.");
    window.addEventListener("pagehide", hide);
    return () => {
      window.removeEventListener("pagehide", hide);
      cancelChat();
      clearTimeout(undoTimer.current);
      clearTimeout(mockUploadTimer.current);
    };
  }, []);
  return (
    <Context.Provider
      value={{
        mode,
        changeMode,
        subject,
        configureSubject,
        warning,
        chat: chats[mode],
        send,
        cancelChat,
        newChat,
        undo,
        undoData,
        override,
        setOverride,
        upload,
        uploadWarning,
        register,
        trackEvaluation,
        locked:
          chats[mode].busy || evaluationBusy || upload?.state === "running",
      }}
    >
      {children}
    </Context.Provider>
  );
}
