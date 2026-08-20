import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import authConfig from "./auth.config";
import { runQuery } from "@/lib/neo4j";

// ── Type augmentation ────────────────────────────────────────────────────────

declare module "next-auth" {
  interface User {
    role?: string;
  }
  interface Session {
    user: {
      role?: string;
    } & DefaultSession["user"];
  }
}

// ── Config ──────────────────────────────────────────────────────────────────

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email =
          typeof credentials?.email === "string" ? credentials.email.trim().toLowerCase() : "";
        const password =
          typeof credentials?.password === "string" ? credentials.password : "";
        if (!email || !password) return null;

        try {
          // :User nodes are a completely separate concern from the knowledge
          // graph (:Person/:Technology/:Ticket) — accounts never mix in.
          const rows = await runQuery(
            `MATCH (u:User) WHERE toLower(u.email) = $email
             RETURN u.email AS email, u.passwordHash AS passwordHash,
                    u.name AS name, u.role AS role
             LIMIT 1`,
            { email }
          );
          const user = rows[0] as
            | { email?: string; passwordHash?: string; name?: string; role?: string }
            | undefined;
          if (!user || typeof user.passwordHash !== "string") return null;

          const valid = await bcrypt.compare(password, user.passwordHash);
          if (!valid) return null;

          return {
            id: (user.email as string) || email,
            name: (user.name as string) || email,
            email: (user.email as string) || email,
            role: (user.role as string) || "analyst",
          };
        } catch (err) {
          console.error("[chrono-auth] user lookup failed:", err);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    // Keep authConfig's `authorized` redirect logic in the full config too.
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.name = user.name;
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.role = (token.role as string) ?? "analyst";
        session.user.name = (token.name as string) ?? session.user.name;
        session.user.email = (token.email as string) ?? session.user.email;
      }
      return session;
    },
  },
});
