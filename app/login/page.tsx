"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Hexagon, Mail, Lock, LogIn, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password || pending) return;
    setPending(true);
    setError(null);

    try {
      const res = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });
      if (res?.error) {
        setError("Invalid email or password. Please try again.");
      } else {
        // Success — middleware will bounce already-logged-in users away from
        // /login, and this refresh pulls the fresh session into the app.
        router.push("/");
        router.refresh();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-chrono-bg px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-chrono-primary to-chrono-violet shadow-lg shadow-chrono-primary/20">
            <Hexagon className="h-6 w-6 text-white" strokeWidth={2.5} />
          </div>
          <div className="text-center">
            <h1 className="text-lg font-bold tracking-tight text-chrono-text">
              ChronoGraph
            </h1>
            <p className="text-xs text-chrono-text-muted">
              Sign in to the forensics assistant
            </p>
          </div>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-chrono-border bg-chrono-surface p-6 shadow-2xl"
        >
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-chrono-text-dim">
              Email
            </span>
            <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-chrono-border bg-chrono-surface-light px-3 py-2 transition-all focus-within:border-chrono-primary/50 focus-within:shadow-lg focus-within:shadow-chrono-primary/10">
              <Mail className="h-4 w-4 flex-shrink-0 text-chrono-text-dim" />
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full bg-transparent text-sm text-chrono-text placeholder-chrono-text-dim outline-none"
              />
            </div>
          </label>

          <label className="mt-4 block">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-chrono-text-dim">
              Password
            </span>
            <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-chrono-border bg-chrono-surface-light px-3 py-2 transition-all focus-within:border-chrono-primary/50 focus-within:shadow-lg focus-within:shadow-chrono-primary/10">
              <Lock className="h-4 w-4 flex-shrink-0 text-chrono-text-dim" />
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-transparent text-sm text-chrono-text placeholder-chrono-text-dim outline-none"
              />
            </div>
          </label>

          {error && (
            <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending || !email.trim() || !password}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-chrono-primary to-chrono-violet py-2.5 text-sm font-semibold text-white shadow-lg shadow-chrono-primary/20 transition-all duration-200 hover:shadow-xl hover:shadow-chrono-primary/30 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogIn className="h-4 w-4" />
            )}
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-chrono-text-muted">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-semibold text-chrono-cyan transition-colors hover:text-teal-300">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
