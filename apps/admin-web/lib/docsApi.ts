import "server-only";

import { buildAdminApiAuthHeader } from "@/lib/adminApiAuth";
import { getDocsApiBaseUrl } from "@/lib/api";

export async function fetchDocsAdmin(path: string, init?: RequestInit) {
  const authHeader = await buildAdminApiAuthHeader();
  const headers = new Headers(init?.headers);

  for (const [key, value] of Object.entries(authHeader)) {
    headers.set(key, value);
  }

  return fetch(`${getDocsApiBaseUrl()}${path}`, {
    ...init,
    headers,
    cache: init?.cache ?? "no-store"
  });
}
