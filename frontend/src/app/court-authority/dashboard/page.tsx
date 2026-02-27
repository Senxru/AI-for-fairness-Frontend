"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { clearAuth } from "@/lib/auth";

export default function CourtAuthorityDashboard() {
  const router = useRouter();

  const logout = () => {
    clearAuth();
    router.push("/court-authority/login");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold leading-tight text-white">
              Court Authority Portal
            </h1>
            <p className="mt-2 text-sm text-slate-300">
              Manage fairness oversight and case data coordination
            </p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="text-sm text-slate-400 transition hover:text-white"
          >
            Log out
          </button>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Link
            href="/court-authority/dashboard/bias-detection"
            className="group flex h-full min-h-[300px] flex-col justify-between rounded-2xl border border-white/10 bg-slate-900/40 p-8 shadow-[0_20px_70px_rgba(15,23,42,0.55)] backdrop-blur transition hover:-translate-y-1 hover:border-emerald-400/50 hover:bg-slate-900/70"
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-300">
                Analytics
              </p>
              <h3 className="mt-4 text-2xl font-semibold text-white">
                Bias Detection
              </h3>
              <p className="mt-4 text-sm text-slate-300">
                Monitor bias metrics across courts, review fairness statistics,
                and generate comprehensive compliance reports.
              </p>
            </div>
            <div className="mt-10 flex items-center text-sm font-semibold text-emerald-300">
              Open Bias Detection
              <svg
                className="ml-2 h-4 w-4 transition group-hover:translate-x-1"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M3 8h10M9 4l4 4-4 4"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </Link>

          <Link
            href="/court-authority/dashboard/input-data"
            className="group flex h-full min-h-[300px] flex-col justify-between rounded-2xl border border-white/10 bg-slate-900/40 p-8 shadow-[0_20px_70px_rgba(15,23,42,0.55)] backdrop-blur transition hover:-translate-y-1 hover:border-emerald-400/50 hover:bg-slate-900/70"
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-300">
                Data Management
              </p>
              <h3 className="mt-4 text-2xl font-semibold text-white">
                Input Data
              </h3>
              <p className="mt-4 text-sm text-slate-300">
                Upload and manage case data, update judicial records, and
                coordinate information across court systems.
              </p>
            </div>
            <div className="mt-10 flex items-center text-sm font-semibold text-emerald-300">
              Open Input Data
              <svg
                className="ml-2 h-4 w-4 transition group-hover:translate-x-1"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M3 8h10M9 4l4 4-4 4"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}

