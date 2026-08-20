import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js configuration. This file must NOT import any Node-only
 * modules (Neo4j driver, bcrypt, etc.) — it is bundled into the middleware
 * edge runtime. The Credentials provider (which needs Neo4j + bcrypt) is
 * added in auth.ts and only runs in the Node runtime route handler.
 */
export default {
  pages: {
    signIn: "/login",
  },
  providers: [], // providers added in auth.ts
  callbacks: {
    /**
     * Runs for every matched route. Returning `false` redirects
     * unauthenticated users to pages.signIn (`/login`). Authenticated users
     * on `/login` are redirected back to the app.
     */
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;
      const isLoginPage = pathname === "/login" || pathname.startsWith("/login");
      const isSignupPage = pathname === "/signup" || pathname.startsWith("/signup");

      // Auth pages are public, but logged-in users are bounced to the app.
      if (isLoginPage || isSignupPage) {
        if (isLoggedIn) {
          return Response.redirect(new URL("/", request.nextUrl));
        }
        return true;
      }
      return isLoggedIn;
    },
  },
} satisfies NextAuthConfig;
