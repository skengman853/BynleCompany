export function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:4000";
}

export function getDocsApiBaseUrl() {
  return process.env.DOCS_API_BASE_URL ?? "http://localhost:4100";
}
