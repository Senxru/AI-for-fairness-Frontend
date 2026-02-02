"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent } from "react";

const inputStyles =
  "w-full rounded-lg border border-white/20 bg-transparent px-4 py-3 text-sm text-white placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none";

export default function CourtAuthorityLoginPage() {
  const router = useRouter();

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    router.push("/court-authority/dashboard");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="relative mx-auto flex w-full max-w-md flex-col gap-8 px-6 py-12">
        <Link
          href="/"
          className="text-sm text-slate-400 transition hover:text-white"
        >
          ← Back to landing
        </Link>
        <div className="space-y-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-emerald-300">
            Authority Login
          </p>
          <h1 className="text-3xl font-semibold leading-tight text-white">
            Access the authority console
          </h1>
          <p className="text-sm text-slate-300">
            Sign in to manage fairness directives, monitor caseloads, and export
            compliance reports.
          </p>
        </div>
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-white/10 bg-slate-900/40 p-8 shadow-[0_20px_70px_rgba(15,23,42,0.55)] backdrop-blur"
        >
          <div className="space-y-4">
            <label className="block text-sm text-white">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Username
              </span>
              <input
                type="text"
                placeholder="director.username"
                className={inputStyles}
              />
            </label>
            <label className="block text-sm text-white">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Password
              </span>
              <input
                type="password"
                placeholder="Enter password"
                className={inputStyles}
              />
            </label>
          </div>
          <button
            type="submit"
            className="mt-8 w-full rounded-lg bg-emerald-400/90 py-3 text-sm font-semibold text-slate-950 transition hover:-translate-y-0.5"
          >
            Log in
          </button>
          <p className="mt-6 text-center text-sm text-slate-300">
            Not signed up?{" "}
            <Link
              href="/court-authority/signup"
              className="font-semibold text-white underline-offset-4 hover:underline"
            >
              Create an authority account
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

