import ast
import importlib
import json
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from service.chat_stream import record, sources_for, structured_answer, wants_ndjson, NO_RESULTS_MESSAGE

DOCS = [types.SimpleNamespace(page_content="동일한 참고문서", metadata={"subject": "시험 법령", "article_number": "제13조", "article_title": "안전난간", "filename": "시험.pdf", "chunk_index": 0})]


def load_app(root=ROOT):
    search = Mock()
    search.invoke.return_value = DOCS
    generate = Mock(side_effect=lambda q, docs: iter([{"text": "같은 답변", "finish_reason": None}, {"text": "", "finish_reason": "stop"}]))
    def plain(q, docs):
        for event in generate(q, docs):
            if event["text"]:
                yield event["text"]
    def old_answer(q, retriever):
        yield from plain(q, retriever.invoke(q))
    fake = {
        "service.file_service": types.SimpleNamespace(file_upload=Mock()),
        "service.rag_service": types.SimpleNamespace(add_data=Mock(), search_obj=Mock(return_value=search)),
        "service.llm_service": types.SimpleNamespace(generate_answer=plain, generate_answer_events=generate, get_answer=old_answer),
        "service.opik_service": types.SimpleNamespace(get_opik_results=lambda: {"experiment_id":"isolated", "experiment_name":"격리 시험", "total":0, "averages":{}, "results":[]}),
    }
    spec = importlib.util.spec_from_file_location("test_app", root / "main.py")
    mod = importlib.util.module_from_spec(spec)
    # StaticFiles uses cwd; avoid reading any model/environment modules.
    import os
    previous = os.getcwd()
    try:
        os.chdir(root)
        with patch.dict(sys.modules, fake):
            spec.loader.exec_module(mod)
    finally:
        os.chdir(previous)
    return mod, search, generate


class TransportTests(unittest.TestCase):
    def test_accept_explicit_only(self):
        for value in (None, "*/*", "application/json", "application/x-ndjson;q=0", "application/x-ndjson;q=bad", "application/x-ndjson;q=nan"):
            self.assertFalse(wants_ndjson(value), value)
        for value in ("application/x-ndjson", "text/plain, application/x-ndjson; q=0.8"):
            self.assertTrue(wants_ndjson(value))

    def test_metadata_null_and_order(self):
        items = sources_for(DOCS + [types.SimpleNamespace(metadata={})])
        self.assertEqual(items[0]["chunk_index"], 0)
        self.assertIsNone(items[1]["law_name"])
        self.assertEqual([x["source_id"] for x in items], ["S1", "S2"])

    def test_empty_skips_model(self):
        gen = Mock()
        rows = list(map(json.loads, structured_answer("q", [], record("sources", search_status="no_results", items=[]), gen)))
        gen.assert_not_called()
        self.assertEqual(rows[-1]["status"], "no_results")
        self.assertEqual(rows[1]["text"], NO_RESULTS_MESSAGE)

    def test_finish_and_text(self):
        for reason, expected in (("stop", "completed"), ("length", "incomplete"), ("content_filter", "incomplete"), (None, "unverified"), ("other", "unverified")):
            with self.subTest(reason=reason):
                gen = lambda q, d: iter([{"text":"가\n나"}, {"text":"", "finish_reason":reason}])
                rows = list(map(json.loads, structured_answer("q", DOCS, record("sources", search_status="found", items=sources_for(DOCS)), gen)))
                self.assertEqual(rows[-1]["status"], expected)
                self.assertEqual(rows[1]["text"], "가\n나")

    def test_empty_generation(self):
        rows = list(map(json.loads, structured_answer("q", DOCS, record("sources", search_status="found", items=[]), lambda q,d:iter([{"text":"  ","finish_reason":"stop"}]))))
        self.assertEqual(rows[-1]["code"], "EMPTY_RESPONSE")

    def test_generation_errors_and_close(self):
        for immediate in (True, False):
            closed = []
            def gen(q, d):
                try:
                    if not immediate:
                        yield {"text":"부분 답변"}
                    raise TimeoutError("PRIVATE_EXCEPTION")
                finally:
                    closed.append(True)
            lines = list(structured_answer("q", DOCS, record("sources", search_status="found", items=[]), gen))
            self.assertEqual(json.loads(lines[-1])["code"], "LLM_TIMEOUT")
            self.assertNotIn("PRIVATE_EXCEPTION", "".join(lines))
            self.assertEqual(closed, [True])


class RouteTests(unittest.TestCase):
    def setUp(self):
        from fastapi.testclient import TestClient
        self.mod, self.search, self.gen = load_app()
        self.client = TestClient(self.mod.app)

    def test_same_route_two_formats_single_search(self):
        for accept, mime in (("*/*", "text/plain"), ("application/x-ndjson", "application/x-ndjson"), ("application/x-ndjson;q=0", "text/plain")):
            self.search.reset_mock()
            self.gen.reset_mock()
            res = self.client.post("/ask/chat", json={"q":"질문"}, headers={"Accept":accept})
            self.assertEqual(res.status_code, 200)
            self.assertTrue(res.headers["content-type"].startswith(mime))
            self.search.invoke.assert_called_once_with("질문")
            self.gen.assert_called_once()
            self.assertIn("Accept", res.headers["vary"].split(", "))
            if mime == "text/plain":
                self.assertEqual(res.text, "같은 답변")
            else:
                rows = [json.loads(s) for s in res.text.splitlines()]
                self.assertEqual(rows[0]["items"], sources_for(DOCS))
                self.assertEqual(rows[-1]["status"], "completed")

    def test_search_failure_http_before_stream(self):
        for exc, status in ((ConnectionError("private"),503), (ValueError("private"),500)):
            self.search.invoke.side_effect = exc
            res = self.client.post("/ask/chat",json={"q":"q"})
            self.assertEqual(res.status_code,status)
            self.assertNotIn("private",res.text)
        self.gen.assert_not_called()

    def test_retriever_construction_failure(self):
        self.mod.search_obj.side_effect = ConnectionError()
        self.assertEqual(self.client.post("/ask/chat",json={"q":"q"}).status_code,503)
        self.gen.assert_not_called()

    def test_no_results_for_both_clients(self):
        self.search.invoke.return_value = []
        for accept in ("*/*", "application/x-ndjson"):
            res=self.client.post("/ask/chat",json={"q":"q"},headers={"Accept":accept})
            self.assertEqual(res.status_code,200)
            self.assertIn(NO_RESULTS_MESSAGE,res.text)
        self.gen.assert_not_called()

    def test_validation(self):
        for body,status in (({},422),({"q":" "},400)):
            self.assertEqual(self.client.post("/ask/chat",json=body).status_code,status)
        self.search.invoke.assert_not_called()

    def test_stream_failure_terminal(self):
        self.gen.side_effect = RuntimeError("private")
        res=self.client.post("/ask/chat",json={"q":"q"},headers={"Accept":"application/x-ndjson"})
        self.assertEqual(res.status_code,200)
        self.assertEqual(json.loads(res.text.splitlines()[-1])["type"],"error")


class ModelCompatibilityTests(unittest.TestCase):
    def test_model_inputs_and_legacy_text_identical_without_environment(self):
        before = ROOT / "tests" / "fixtures" / "llm_service_before.py.txt"
        after = ROOT / "service" / "llm_service.py"
        # Execute only function definitions; never module imports or dotenv setup.
        outputs = []
        calls = []
        for path in (before, after):
            tree = ast.parse(path.read_text(encoding="utf-8"))
            defs = [n for n in tree.body if isinstance(n, ast.FunctionDef)]
            prompt_node = next(n for n in tree.body if isinstance(n, ast.Assign) and any(isinstance(t,ast.Name) and t.id=="prompt" for t in n.targets))
            calls.append(ast.dump(prompt_node))
            stream = [types.SimpleNamespace(choices=[types.SimpleNamespace(delta=types.SimpleNamespace(content=t),finish_reason=f)]) for t,f in (("같은 ",None),("답변",None),(None,"stop"))]
            class FakeStream(list):
                def close(self): pass
            create = Mock(return_value=FakeStream(stream))
            prompt = types.SimpleNamespace(format_messages=lambda **kw:[types.SimpleNamespace(type="human",content=kw["context"]+kw["query"])])
            ns={"client":types.SimpleNamespace(chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=create))), "prompt":prompt, "MODEL_NAME":"same"}
            exec(compile(ast.Module(body=defs,type_ignores=[]),str(path),"exec"),ns)
            outputs.append(("".join(ns["generate_answer"]("q",DOCS)),create.call_args))
        self.assertEqual(calls[0],calls[1])
        self.assertEqual(outputs[0],outputs[1])


if __name__ == "__main__":
    unittest.main(verbosity=2)
