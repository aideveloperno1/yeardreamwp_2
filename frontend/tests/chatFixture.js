export const source = { source_id: "S1", law_name: "시험 법령", article_number: "제13조", article_title: "안전난간", filename: "시험.pdf", chunk_index: 0 };
export const line = (type, fields = {}) => JSON.stringify({ v: 1, type, ...fields }) + "\n";
export const sourcesLine = line("sources", { search_status: "found", items: [source] });
export const wire = (text = "답변", status = "completed", reason = "stop") => sourcesLine + line("delta", { text }) + line("done", { status, finish_reason: reason });
export const chatResponse = (text) => new Response(wire(text), { headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } });
