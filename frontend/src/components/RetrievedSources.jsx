export default function RetrievedSources({ result: r }) {
  return (
    <section aria-label="검색 참고자료" className="retrieved-sources">
      <h3>검색 참고자료</h3>
      {r.searchStatus === "no_results" ? (
        <p>검색 결과가 없습니다. 적용할 법령이 없다는 뜻은 아닙니다.</p>
      ) : r.retrievedSources?.length ? (
        <>
          <p className="muted">
            답변에 실제 인용된 조문 목록이 아니라 검색 결과입니다.
          </p>
          <ol>
            {r.retrievedSources.map((s) => (
              <li key={s.source_id}>
                <strong>
                  {s.article_number || "조문 번호 미기록"}
                  {s.article_title ? ` · ${s.article_title}` : ""}
                </strong>
                <p>{s.law_name || "법령명 미기록"}</p>
                <p className="muted">
                  {s.filename || "파일명 미기록"}
                  {s.chunk_index !== null ? ` · 청크 ${s.chunk_index}` : ""}
                </p>
              </li>
            ))}
          </ol>
          <p className="muted">
            시행일 미확인 · 조문 전문과 원문 링크는 제공하지 않습니다.
          </p>
        </>
      ) : (
        <p className="muted">
          {r.status === "streaming"
            ? "검색 결과를 기다리고 있습니다."
            : "이 요청의 검색 참고자료는 미기록입니다."}
        </p>
      )}
    </section>
  );
}
