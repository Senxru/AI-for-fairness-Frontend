import Link from "next/link";

const inputStyles =
  "w-full rounded-lg border border-white/20 bg-transparent px-4 py-3 text-sm text-white placeholder:text-slate-400 focus:border-sky-400 focus:outline-none";

export default function JudgeSignupPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="relative mx-auto flex w-full max-w-md flex-col gap-8 px-6 py-12">
        <Link
          href="/judge/login"
          className="text-sm text-slate-400 transition hover:text-white"
        >
          ← Back to login
        </Link>
        <div className="space-y-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-sky-300">
            Judge Sign Up
          </p>
          <h1 className="text-3xl font-semibold leading-tight text-white">
            Create your judge account
          </h1>
          <p className="text-sm text-slate-300">
            Provide your verified bench details to unlock AI-powered fairness
            oversight.
          </p>
        </div>
        <form className="rounded-2xl border border-white/10 bg-slate-900/40 p-8 shadow-[0_20px_70px_rgba(15,23,42,0.55)] backdrop-blur">
          <div className="space-y-4">
            <label className="block text-sm text-white">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Full name
              </span>
              <input
                type="text"
                placeholder="Justice Ada Spencer"
                className={inputStyles}
              />
            </label>
            <label className="block text-sm text-white">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Username
              </span>
              <input
                type="text"
                placeholder="bench.username"
                className={inputStyles}
              />
            </label>
            <label className="block text-sm text-white">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Password
              </span>
              <input
                type="password"
                placeholder="Create a password"
                className={inputStyles}
              />
            </label>
            <label className="block text-sm text-white">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Bench ID
              </span>
              <input
                type="text"
                placeholder="E.g. 9th-District-42"
                className={inputStyles}
              />
            </label>
          </div>
          <button
            type="submit"
            className="mt-8 w-full rounded-lg bg-white py-3 text-sm font-semibold text-slate-900 transition hover:-translate-y-0.5"
          >
            Sign up
          </button>
        </form>
      </div>
    </div>
  );
}

