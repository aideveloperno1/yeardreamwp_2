> 선택 5항목 갱신(2026-10-24): 기존 POST /ask/chat에서 React는 NDJSON을 요청해 검색 참고자료와 생성 종료 상태를 표시합니다. 기존 HTML·평가 수집기에는 text/plain을 유지합니다. 검색 실패는 HTTP 오류, 검색 0건은 모델 미호출 고정 안내입니다. 실제 평가 부제는 저장 결과 조회로 수정했습니다. 최신 계약은 docs/api-contract.md를 기준으로 하며 아래의 과거 구현·검증 설명과 구분합니다.

> 2026-10-24 현재 구현 갱신: 상담은 `{q}`만 보내며 법령은 서버에서 ‘산업안전보건기준에 관한 규칙’으로 고정합니다. 등록 법령 입력은 등록 화면에서 별도로 설정하며 상담에 영향을 주지 않습니다. 실제 평가 화면은 `GET /admin/opik/results`로 지정된 단일 실험 결과를 조회합니다. 실제 평가 실행·실험 선택·A/B 비교는 미지원입니다. 아래의 과거 제안·검증 이력과 구분합니다.
>
> 기존 실행 기록의 법령명은 당시 화면 설정값으로 보존합니다. 새 기록은 고정 법령 계약을 표시합니다. VITE_RAG_SUBJECT는 등록 법령 초기값이며 API·모델 비밀 키는 프런트에 저장하지 않습니다. 개발 프록시는 /ask, /upload, /admin을 전달하며 preview는 JSON 503을 반환합니다. 실제 배포 라우팅은 별도입니다.

# 작업장 안전기준 안내 챗봇 frontend

React + React Router + Vite로 구성한 클라이언트다. 상담·법령 RAG 관리·품질 평가·조문 상세·실행 추적/세션·목업 안내를 제공한다. 기존 CSS, Pretendard 글꼴, 모의 질문 분기와 평가 집계 로직을 이식했다.

## 실행

검증 환경은 Node.js 24.19.0, npm 11.17.0이다. 처음 받았거나 의존성을 다시 구성할 때 frontend 폴더에서 실행한다.

```powershell
npm.cmd ci
npm.cmd start
```

기본 주소는 `http://127.0.0.1:3000/chat`이다. `npm.cmd run dev`도 같다. 기존 서버가 3000번 포트를 사용하면 실행이 중단된다. 관련 없는 서버를 종료하지 말고 실행 위치를 확인하거나 `npm.cmd start -- --port 3001`로 별도 확인한다. 포트나 localhost/127.0.0.1을 바꾸면 브라우저 저장 자료도 별개다. 파일을 더블클릭하는 file:// 실행은 지원하지 않는다.

## 모의 모드와 실제 API

기본은 **모의 모드**다. 질문 분기·답변·근거·PDF 등록·평가·추적의 예시를 보여준다. 실제 PDF를 읽지 않고 모델을 호출하지 않는다. 자체 평가 점수·모의 시간·건수는 실측값이 아니다.

실제 API 모드는 상단 연결 모드에서 선택한다. 기존 FastAPI를 별도로 실행한다. 등록 법령명은 등록 화면에서 입력한다. 표시 법령명과 내부 subject가 같다고 가정하지 않는다. 필요하면 `.env.example`을 참고해 로컬 `.env.local`에 다음 공개 개발 설정만 둔다.

```dotenv
API_PROXY_TARGET=http://127.0.0.1:8000
VITE_RAG_SUBJECT=
VITE_API_CONNECTION_ID=
```

`API_PROXY_TARGET`은 개발 프록시 대상이다. 주소를 바꾸면 Vite를 다시 시작한다. 개발 대상 주소가 달라지면 연결 대상을 확인한다. 등록 subject 변경은 상담에 영향을 주지 않는다. 같은 URL 뒤의 서버/DB 교체는 클라이언트가 자동 감지할 수 없으므로 공개 식별자 `VITE_API_CONNECTION_ID`도 바꾼다. frontend 환경 변수에 ELICE_API_KEY 등 비밀 키를 넣지 않는다. 외부 모델 키는 백엔드에서 관리한다.

| 기능 | 연결한 현재 계약 | 한계 |
|---|---|---|
| 상담 | POST /ask/chat, JSON q + Accept NDJSON → 참고자료·답변·종료 상태 | 이전 메시지·서버 세션·원문·시행일·검색 점수 미제공 |
| 등록 | POST /upload, FormData subject/file → {"upload":["파일명"]} | 조문/청크 수·문서 목록 조회 미제공 |
| 평가 결과 | GET /admin/opik/results | 단일 실험 저장 결과 조회, 실행·A/B 비교 미지원 |
| 조문·서버 추적 | 실제 조회 계약 미구현 | 모의 모드에서 예시 제공 |

실제 질문은 매번 필요한 장소·상황을 포함해 보낸다. 목업 분류로 실제 질문을 차단하거나 실제 실패를 예시 답변으로 대체하지 않는다. 서버 텍스트는 HTML로 실행하지 않는다. 부분 답변은 오류·수신 중단 상태와 함께 보존한다. 새 화면은 done/error를 확인하고 종료 없는 EOF를 실패로 처리한다. stop은 생성 종료 정보이며 법령 정답 보장이 아니다.

등록은 같은 subject의 기존 청크를 교체한다. 독립된 시험 DB에서 먼저 확인한다. 등록 중 내부 페이지를 이동해도 요청과 중복 잠금은 유지한다. 파일 저장 후 색인 실패나 응답 유실이면 ‘결과 확인 필요’가 될 수 있다. 자동 재시도하지 않으며 같은 파일명 재등록 전에 서버 파일·색인 상태를 확인한다. 파일 내용은 브라우저 저장소에 보관하지 않는다.

## 검사와 빌드

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run verify:build
npm.cmd run verify:proxy
```

Vitest/React Testing Library 검사는 문맥 분기, 전체 답변, 저장 호환, 평가 집계·A/B, StrictMode 중복 방지, 취소·늦은 응답, 업로드·모드 격리·경로·테마 등을 다룬다. 이전 HTML/DOM ID 검사 목적을 로직·컴포넌트 검사로 이식했다.

`verify:build`는 dist 파일·직접 경로·HEAD·글꼴 해시/라이선스·API 오류 분리·비공개 소스 경로를 임시 로컬 HTTP 서버에서 확인한다. `verify:proxy`는 분리된 시험 서버로 실제 개발 프록시와 전송 계약을 확인하며 실제 DB·모델을 호출하지 않는다. 두 검사는 로컬 TCP 통신이 허용된 환경에서 실행한다.

```powershell
npm.cmd run preview
```

빌드 미리보기는 `http://127.0.0.1:4173/`다. **미리보기에는 API를 연결하지 않으며 API 경로에는 JSON 503을 반환한다.** 실제 연결 확인에는 개발 서버를 사용한다. 최종 배포는 dist와 FastAPI를 같은 origin으로 제공하는 설정을 별도로 조율해야 한다. Vite 개발/preview 서버를 운영 배포 완료로 취급하지 않는다.

Chrome에서 상담·등록·평가 화면의 기본 흐름, 빈 입력 안내, 한글 입력 후 Enter 전송, 일반/다크 전환, 390px 상담 화면과 콘솔을 확인했다. 검증한 흐름에서 오류는 없었다. OS 한글 IME 조합 과정 자체와 전체 화면·기기 조합 검증은 별도다. 10월 24일 자동 검사는 60개 통과했으며 실제 DB·모델 시험을 대신하지 않는다.

## 기록과 경로

- 모의: localStorage `mockup.chat.v1`, `mockup.runs.v1`(최대 60건), sessionStorage `mockup.evaluation.v1`.
- 실제: localStorage `safety-chat.live.chat.v1`, `safety-chat.live.runs.v1`, sessionStorage `safety-chat.live.upload.v1`.
- 공통 테마: `safety-chat.theme`. 일반·다크·시스템, 탭 간 변경 동기화.
- 손상되거나 지원하지 않는 저장 자료는 원래 값을 보존하고 경고한다. 이전 답변에서 저장하지 않은 내용을 새 데이터로 채우지 않는다.
- 상담 중 이탈은 요청을 취소하고 실제 부분 답변을 보존한다. 새 상담의 되돌리기는 기록만 복원하며 요청을 재실행하지 않는다. 모의 평가는 페이지 이탈/새로고침 시 중단된다.
- `/chat`, `/documents`, `/evaluation`, `/law?id=…`, `/trace#run=…` 또는 `#session=…`, `/guide`. 기존 *.html 주소도 쿼리·해시를 유지해 연결한다. 명시적으로 잘못된 ID를 다른 기록으로 대체하지 않는다.

## 유지보수

화면은 src/pages, 공통 UI는 src/components, 상태와 비동기는 src/hooks, API는 src/services, 순수 모의 로직·저장은 src/lib에 있다. `npm.cmd run format`으로 JS/JSX를 정리할 수 있다. public/fonts의 바이너리·라이선스·출처를 함께 보존한다.

현재 제한·법령 검수·평가 자료 사용 사실은 [현재 상태](docs/current-status.md), 코드 기준 명세와 미확정 확장 예시는 [API 계약](docs/api-contract.md), 실행 기준·팀원 확인 항목은 [연동 준비](docs/integration-readiness.md)에 정리했다. 이전본과 날짜별 작업 기록은 frontend 밖에서 관리한다. node_modules/dist/로컬 환경 파일은 Git에 넣지 않는다. 로컬 파일 반영과 GitHub 반영은 별개다.
