import { DefaultSession } from "next-auth";

type UserRole = "OWNER" | "STAFF";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      tenantId: string;
    } & DefaultSession["user"];
  }

  interface User {
    role?: UserRole;
    tenantId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: UserRole;
    tenantId?: string;
  }
}
