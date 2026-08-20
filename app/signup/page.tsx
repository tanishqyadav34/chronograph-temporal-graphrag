"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Hexagon, Mail, Lock, User as UserIcon, UserPlus, Loader2 } from "lucide-react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;

    // Client-side validation (the API re-validates server-side too).
    if (!name.trim()) return setError("Please enter your name.");
    if (!EMAIL_RE.test(email.trim())) return setError("Please enter a valid email address.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords don't match.");
    setError(null);
    setPending(true);

    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Signup failed. Please try again.");
        setPending(false);
        return;
      }

      // Auto-login with the just-created credentials (simplest with the
      // existing Credentials provider), then land in the app.
      const signInRes = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });
      if (signInRes?.error) {
        router.push("/login");
      } else {
        router.push("/");
        router.refresh();
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setPending(false);
    }
  };

  const fieldClass =
    "w-full bg-transparent text-sm text-chrono-text placeholder-chrono-text-dim outline-none";
  const wrapperClass =
    "mt-1.5 flex items-center gap-2 rounded-lg border border-chrono-border bg-chrono-surface-light px-3 py-2 transition-all focus-within:border-chrono-primary/50 focus-within:shadow-lg focus-within:shadow-chrono-primary/10";

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
              Create your account
            </h1>
            <p className="text-xs text-chrono-text-muted">
              Start using ChronoGraph
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
              Name
            </span>
            <div className={wrapperClass}>
              <UserIcon className="h-4 w-4 flex-shrink-0 text-chrono-text-dim" />
              <input
                type="text"
                required
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                className={fieldClass}
              />
            </div>
          </label>

          <label className="mt-4 block">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-chrono-text-dim">
              Email
            </span>
            <div className={wrapperClass}>
              <Mail className="h-4 w-4 flex-shrink-0 text-chrono-text-dim" />
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className={fieldClass}
              />
            </div>
          </label>

          <label className="mt-4 block">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-chrono-text-dim">
              Password
            </span>
            <div className={wrapperClass}>
              <Lock className="h-4 w-4 flex-shrink-0 text-chrono-text-dim" />
              <input
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className={fieldClass}
              />
            </div>
          </label>

          <label className="mt-4 block">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-chrono-text-dim">
              Confirm password
            </span>
            <div className={wrapperClass}>
              <Lock className="h-4 w-4 flex-shrink-0 text-chrono-text-dim" />
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat your password"
                className={fieldClass}
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
            disabled={
              pending || !name.trim() || !email.trim() || !password || !confirm
            }
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-chrono-primary to-chrono-violet py-2.5 text-sm font-semibold text-white shadow-lg shadow-chrono-primary/20 transition-all duration-200 hover:shadow-xl hover:shadow-chrono-primary/30 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            {pending ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-chrono-text-muted">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-chrono-cyan transition-colors hover:text-teal-300">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
