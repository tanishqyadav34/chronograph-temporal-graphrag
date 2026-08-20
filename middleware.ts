import NextAuth from "next-auth";
import authConfig from "./auth.config";

// Edge-safe middleware: verifies the JWT session without bundling the
// Neo4j/bcrypt Credentials provider. Unauthenticated users are redirected
// to /login by the `authorized` callback in auth.config.ts.
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Protect every route except the auth/signup APIs and static assets. This
  // also guards /api/chat, so the chat API stays functional but gated.
  matcher: [
    "/((?!api/auth|api/signup|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
