"""Transport helpers. No database, model client or environment initialization."""
import json
import math

NO_RESULTS_MESSAGE = "관련 조문을 찾지 못했습니다. 질문을 구체적으로 바꾸거나 등록된 법령 자료를 확인해 주세요."


def wants_ndjson(accept):
    for part in (accept or "").split(","):
        fields = [s.strip().lower() for s in part.split(";")]
        if fields[0] != "application/x-ndjson":
            continue
        quality = 1.0
        try:
            for value in fields[1:]:
                if value.startswith("q="):
                    quality = float(value[2:])
            if math.isfinite(quality) and 0 < quality <= 1:
                return True
        except ValueError:
            pass
    return False


def record(kind, **fields):
    return json.dumps({"v": 1, "type": kind, **fields}, ensure_ascii=False, allow_nan=False) + "\n"


def sources_for(docs):
    items = []
    for index, doc in enumerate(docs, 1):
        meta = doc.metadata or {}
        item = {"source_id": f"S{index}"}
        for target, key in (("law_name", "subject"), ("article_number", "article_number"),
                            ("article_title", "article_title"), ("filename", "filename")):
            value = meta.get(key)
            item[target] = value if isinstance(value, str) and value.strip() else None
        value = meta.get("chunk_index")
        item["chunk_index"] = value if type(value) is int and value >= 0 else None
        items.append(item)
    return items


def is_unavailable(exc):
    """Only known connection/timeout failures map to service unavailable."""
    seen = set()
    while exc is not None and id(exc) not in seen:
        seen.add(id(exc))
        if isinstance(exc, (ConnectionError, TimeoutError)) or type(exc).__name__ in {
            "ConnectError", "ConnectTimeout", "ReadTimeout", "PoolTimeout", "NetworkError",
        }:
            return True
        exc = exc.__cause__ or exc.__context__
    return False


def model_error(exc):
    if isinstance(exc, TimeoutError) or "timeout" in type(exc).__name__.lower():
        return "LLM_TIMEOUT", "답변 생성 대기 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요."
    return "LLM_ERROR", "답변 생성 중 오류가 발생했습니다. 받은 내용이 있다면 일부 답변입니다."


def structured_answer(query, docs, first_record, generate):
    yield first_record
    if not docs:
        yield record("delta", text=NO_RESULTS_MESSAGE)
        yield record("done", status="no_results", finish_reason=None)
        return
    text = ""
    finish_reason = None
    events = None
    try:
        events = generate(query, docs)
        for event in events:
            content = event.get("text")
            if content:
                text += content
                yield record("delta", text=content)
            if event.get("finish_reason") is not None:
                finish_reason = event["finish_reason"]
        if not text.strip():
            yield record("error", code="EMPTY_RESPONSE", stage="generation", message="답변 본문을 받지 못했습니다. 다시 시도해 주세요.")
            return
        status = "completed" if finish_reason == "stop" else (
            "incomplete" if finish_reason in {"length", "content_filter"} else "unverified")
        yield record("done", status=status, finish_reason=finish_reason)
    except Exception as exc:
        code, message = model_error(exc)
        yield record("error", code=code, stage="generation", message=message)
    finally:
        if events is not None and hasattr(events, "close"):
            events.close()


def plain_answer(query, docs, generate):
    if not docs:
        yield NO_RESULTS_MESSAGE
        return
    yield from generate(query, docs)
