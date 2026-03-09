export function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:4000";
}
