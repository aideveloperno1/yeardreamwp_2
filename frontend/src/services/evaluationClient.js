import { ApiError, errorMessage } from "./chatClient.js";
const object = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const scores = (v) =>
  object(v) &&
  Object.values(v).every((n) => typeof n === "number" && Number.isFinite(n));
export async function fetchEvaluation({ signal, fetcher = fetch } = {}) {
  const response = await fetcher("/admin/opik/results", {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok)
    throw new ApiError(await errorMessage(response), response.status);
  let data;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(
      "평가 결과 응답을 해석할 수 없습니다. 서버와 경로를 확인하세요.",
    );
  }
  if (
    !object(data) ||
    typeof data.experiment_id !== "string" ||
    !data.experiment_id.trim() ||
    typeof data.experiment_name !== "string" ||
    !Number.isSafeInteger(data.total) ||
    data.total < 0 ||
    !scores(data.averages) ||
    !Array.isArray(data.results) ||
    data.total !== data.results.length ||
    !data.results.every(
      (r) => object(r) && typeof r.question === "string" && scores(r.scores),
    )
  ) {
    throw new ApiError(
      "평가 결과 응답 형식이 다릅니다. 서버 결과 확인이 필요합니다.",
    );
  }
  return data;
}
