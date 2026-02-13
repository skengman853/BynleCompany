import "server-only";

import { auth } from "@/auth";
import { cookies } from "next/headers";

function getAuthSessionTokenFromCookies(): string | null {
  const cookieStore = cookies();
  const tokenNames = [
    "__Secure-authjs.session-token",
    "authjs.session-token",
    "__Secure-next-auth.session-token",
    "next-auth.session-token"
  ];

  for (const name of tokenNames) {
    const value = cookieStore.get(name)?.value;
    if (value) {
      return value;
    }
  }

  return null;
}

export async function buildAdminApiAuthHeader(): Promise<{ "x-authjs-session-token": string }> {
  const session = await auth();

  if (!session?.user?.id || !session.user.tenantId) {
    throw new Error("Unauthorized: missing session identity for admin API call.");
  }

  const sessionToken = getAuthSessionTokenFromCookies();
  if (!sessionToken) {
    throw new Error("Unauthorized: missing auth session cookie.");
  }

  return {
    "x-authjs-session-token": sessionToken
  };
}
