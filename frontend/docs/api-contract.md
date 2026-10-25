# 현재 API 계약 — 선택 5항목 반영

기준: 2026-10-24, `/ask/chat` 경로 유지. SSE와 `/ask/chat/stream`은 도입하지 않는다.

## 상담

POST `/ask/chat`, JSON `{ "q": "질문" }`. 상담 법령은 서버 고정이며 subject는 보내지 않는다.
React는 `Accept: application/x-ndjson`으로 요청한다. 명시적인 NDJSON 허용이 없는 HTML·평가 수집기에는 기존 `text/plain` 스트림을 제공한다. 자동 재전송은 없다.

검색은 응답 시작 전에 한 번 수행한다. 연결·시간 초과 오류는 503, 기타 검색 오류는 500과 안전한 `detail` 문자열을 반환한다. 공백 질문은 400, 잘못된 본문은 422다. 검색 0건은 200과 고정 안내이며 모델을 호출하지 않는다.

## 줄 단위 JSON 스트림

모든 레코드는 JSON 객체와 LF 한 줄이며 `v: 1`이다. Content-Type은 `application/x-ndjson`이다.

| type | 필드 | 순서 |
|---|---|---|
| sources | search_status: found/no_results, items | 첫 레코드 1회 |
| delta | text | 0회 이상 |
| done | status, finish_reason | 정상 전송 종료 1회 |
| error | code, stage, message | 실패 종료 1회, done 없음 |

items: source_id(응답 내 순번), law_name, article_number, article_title, filename, chunk_index. 누락 메타데이터는 null이다. 본문·원문 링크·검색 점수·시행일은 제공하지 않는다. 파일명 날짜를 시행일로 해석하지 않는다. 검색된 자료와 실제 인용한 조문은 다를 수 있다.

done.status: completed(stop+본문), incomplete(length/content_filter), unverified(종료 사유 미확인/기타), no_results(검색 0건). 공백 생성은 EMPTY_RESPONSE 오류다. completed는 생성 종료이며 법령 정답 보장이 아니다. 실제 SDK 시간 제한 120초·max_retries=2는 유지한다. 애플리케이션에서 생성 함수를 한 번 호출해도 SDK 재시도는 발생할 수 있다.

파서는 UTF-8/레코드 분할, CRLF와 여러 레코드 수신을 처리한다. 중복·순서 오류, 미지원 버전, 종료 없는 EOF와 미완결 마지막 줄은 실패다. 받은 텍스트와 참고자료는 오류·취소에도 보존한다. 취소는 브라우저 수신 중단이며 원격 모델 중단을 보장하지 않는다.

검증된 done/error 레코드를 받으면 HTTP EOF를 기다리지 않고 응답을 확정하고 reader를 취소·해제한다. 같은 수신 조각에 이미 포함된 종료 뒤 데이터는 형식 오류로 처리한다. 종료 뒤에 도착할 데이터까지 기다려 검사하지는 않는다. 종료 레코드가 없는 연결 대기는 기존 시간 제한 정책을 유지한다.

한 번의 네트워크 수신에 여러 delta가 있으면 본문 누적은 모두 수행하고 onText는 한 번 호출한다. 별도의 타이머로 표시를 지연하지 않는다. 같은 수신에 뒤따르는 형식 오류가 있어도 그 앞의 유효한 본문은 전달한다.

기존 텍스트 클라이언트의 생성 중 오류에는 구조화 종료 정보가 없다. 새로운 React 모드에서만 위 종료 상태를 표시한다.

## 등록·평가

POST `/upload`: 기존 multipart subject/file → {upload:[파일명]} 계약 유지.
GET `/admin/opik/results`: 지정된 단일 실험 저장 결과 조회. 실제 평가 실행·실험 선택·A/B 비교는 미지원.

## 저장과 실행 추적

기존 status(streaming/received/error/interrupted)·브라우저 저장 키를 유지한다. retrievedSources/searchStatus/generationStatus/finishReason을 선택 필드로 저장한다. 모의 sources 키 배열은 유지한다. 예전 기록은 미기록으로 표시하며 새 자료를 채우지 않는다. 실행 추적은 브라우저 기록이고 서버 로그·검색 점수·Opik 추적 연결이 아니다.

서버 반영 및 형식 확인 후 새 화면을 반영한다. 복구는 이전 화면부터 수행한다. 이전 화면도 새 기록의 본문을 읽을 수 있으나 추가 참고자료는 표시하지 못한다.
