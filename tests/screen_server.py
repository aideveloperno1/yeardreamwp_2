"""Isolated UI comparison server. Never loads model settings or the real DB.

Run: python tests/screen_server.py --root <before-or-after> --port 8101
This is test tooling, not a production API or fallback.
"""
import argparse
import json
import sys
from pathlib import Path
from types import SimpleNamespace
import uvicorn

sys.path.insert(0,str(Path(__file__).resolve().parent))
from test_chat_transport import load_app, DOCS

parser=argparse.ArgumentParser()
parser.add_argument("--root",type=Path,required=True)
parser.add_argument("--port",type=int,required=True)
args=parser.parse_args()
module, search, generate=load_app(args.root)
normal="[답변]\n계단 측면에는 안전난간 설치 기준을 확인해야 합니다. 구체적인 적용 조건은 해당 조문 원문을 대조해 주세요.\n\n[근거 조문]\n격리 시험용 참고자료입니다. 실제 법령 상담 결과가 아닙니다."

def retrieve(q):
    if "검색 실패" in q:
        raise ConnectionError("isolated search unavailable")
    return [] if "검색 0건" in q else DOCS
search.invoke.side_effect=retrieve

def events(q, docs):
    if "중간 오류" in q:
        yield {"text":"[답변]\n설치 기준을 확인하던 중 응답이 중단되었습니다.","finish_reason":None}
        raise RuntimeError("isolated model stream failure")
    # Before intentionally demonstrates the old empty-search generation behavior.
    text=normal if docs else "[답변]\n검색된 참고문서가 없지만 모델이 답변을 생성했습니다.\n\n이 문장은 빈 검색 상황을 재현하기 위한 시험 응답입니다."
    yield {"text":text,"finish_reason":None}
    yield {"text":"","finish_reason":"length" if "길이 제한" in q else None if "종료 미확인" in q else "stop"}
generate.side_effect=events

# Keep evaluation UI successful and reproducible without calling Opik.
module.get_opik_results=lambda:{"experiment_id":"isolated-ui-test","experiment_name":"격리 시험용 평가 결과", "total":1,"averages":{"quality":1},"results":[{"question":"화면 표시 확인용 질문","answer":"시험 응답","scores":{"quality":1}}]}
uvicorn.run(module.app,host="127.0.0.1",port=args.port,log_level="warning")
