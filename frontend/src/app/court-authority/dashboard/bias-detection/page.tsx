"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/lib/api";

type AuditReport = {
  DP: number;
  EO: number;
  "Bias Score": number;
  "Bias Level": "Low" | "Moderate" | "High";
  cases_used: number;
  error?: string;
};

export default function BiasDetectionPage() {
  const [report, setReport] = useState<AuditReport | null>(null);
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    const fetchAudit = async () => {
      try {
        setLoading(true);

        const res = await apiFetch("/audit-report", { cache: "no-store" });
        const data = (await res.json()) as AuditReport;

        if (!res.ok || data.error) {
          throw new Error(data.error || "Failed to fetch audit report");
        }

        setReport(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";

        setReport({
          DP: 0,
          EO: 0,
          "Bias Score": 0,
          "Bias Level": "Low",
          cases_used: 0,
          error: message,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchAudit();
  }, []);

  const getStatusColor = (status: string) => {
    if (status === "Low Risk" || status === "Low") return "text-emerald-400";
    if (status === "Moderate Risk" || status === "Moderate") return "text-yellow-400";
    return "text-red-400";
  };

  const getScoreColor = (score: number) => {
    if (score < 0.1) return "text-emerald-400";
    if (score < 0.3) return "text-yellow-400";
    return "text-red-400";
  };

 
  const systemScore10 = useMemo(() => {
    if (!report) return 0;
    return Math.min(10, Math.max(0, report["Bias Score"] * 10));
  }, [report]);

  const riskLabel = useMemo(() => {
    if (!report) return "Moderate Risk";
    if (report["Bias Level"] === "Low") return "Low Risk";
    if (report["Bias Level"] === "Moderate") return "Moderate Risk";
    return "High Risk";
  }, [report]);

  
  const biasMetrics = useMemo(() => {
    if (!report) return [];

    return [
      {
        category: "Demographic Parity (DP)",
        score: Math.abs(report.DP) * 10, // just to display on /10 scale
        status: report["Bias Level"],
        trend: report["Bias Score"] < 0.1 ? "↓" : report["Bias Score"] < 0.3 ? "→" : "↑",
        description: "Difference in positive prediction rates across regions.",
        courts: 24, // dummy for now
        cases: report.cases_used,
        raw: report.DP,
      },
      {
        category: "Equalized Odds (EO)",
        score: Math.abs(report.EO) * 10,
        status: report["Bias Level"],
        trend: report["Bias Score"] < 0.1 ? "↓" : report["Bias Score"] < 0.3 ? "→" : "↑",
        description: "Difference in error rates across regions.",
        courts: 24,
        cases: report.cases_used,
        raw: report.EO,
      },
      {
        category: "Overall Bias Score",
        score: report["Bias Score"] * 10,
        status: report["Bias Level"],
        trend: report["Bias Score"] < 0.1 ? "↓" : report["Bias Score"] < 0.3 ? "→" : "↑",
        description: "Average of |DP| and |EO| used to classify bias risk.",
        courts: 24,
        cases: report.cases_used,
        raw: report["Bias Score"],
      },
    ];
  }, [report]);

 
  const courtsData = [
    { name: "9th District Court", biasScore: 2.1, cases: 342, status: "Low Risk" },
    { name: "Central Judicial District", biasScore: 4.8, cases: 289, status: "High Risk" },
    { name: "Northern Circuit Court", biasScore: 3.2, cases: 456, status: "Moderate Risk" },
    { name: "Southern Bench", biasScore: 2.9, cases: 312, status: "Low Risk" },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-12">
        <div className="flex items-center justify-between">
          <div>
            <Link
              href="/court-authority/dashboard"
              className="text-sm text-slate-400 transition hover:text-white"
            >
              ← Back to Dashboard
            </Link>
            <h1 className="mt-4 text-3xl font-semibold leading-tight text-white">
              Bias Detection
            </h1>
            <p className="mt-2 text-sm text-slate-300">
              System-wide bias metrics and fairness monitoring
            </p>
          </div>
        </div>

       
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-8 shadow-[0_20px_70px_rgba(15,23,42,0.55)] backdrop-blur">
          {loading ? (
            <p className="text-slate-300">Loading bias report...</p>
          ) : report?.error ? (
            <div>
              <p className="text-red-400 font-semibold">Failed to load</p>
              <p className="mt-2 text-sm text-slate-300">{report.error}</p>
              <p className="mt-2 text-xs text-slate-400">
                Check: FastAPI is running, and CORS allows http://localhost:3000
              </p>
            </div>
          ) : (
            <div className="mb-8">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-300">
                System-Wide Bias Score
              </p>
              <div className="mt-4 flex items-baseline gap-4">
                <span className={`text-5xl font-bold ${getScoreColor(report!["Bias Score"])}`}>
                  {systemScore10.toFixed(2)}
                </span>
                <span className="text-lg text-slate-400">/ 10.0</span>
                <span
                  className={`ml-auto rounded-full px-4 py-2 text-sm font-semibold ${
                    report!["Bias Level"] === "Low"
                      ? "bg-emerald-400/20 text-emerald-400"
                      : report!["Bias Level"] === "Moderate"
                      ? "bg-yellow-400/20 text-yellow-400"
                      : "bg-red-400/20 text-red-400"
                  }`}
                >
                  {riskLabel}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-300">
                Based on analysis of{" "}
                <span className="font-semibold text-white">{report!.cases_used}</span>{" "}
                cases (current audit dataset)
              </p>
            </div>
          )}
        </div>

       
        {!loading && report && !report.error && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {biasMetrics.map((metric) => (
              <div
                key={metric.category}
                className="rounded-2xl border border-white/10 bg-slate-900/40 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.55)] backdrop-blur"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-white">
                    {metric.category}
                  </h3>
                  <span className={`text-2xl font-bold ${getStatusColor(metric.status)}`}>
                    {metric.trend}
                  </span>
                </div>

                <div className="mt-4 flex items-baseline gap-2">
                  <span className={`text-3xl font-bold ${getStatusColor(metric.status)}`}>
                    {metric.score.toFixed(1)}
                  </span>
                  <span className="text-sm text-slate-400">/ 10.0</span>
                </div>

                <p className={`mt-2 text-xs font-semibold ${getStatusColor(metric.status)}`}>
                  {metric.status}
                </p>

                <p className="mt-2 text-sm text-slate-300">{metric.description}</p>

                <div className="mt-4 border-t border-white/10 pt-4">
                  <p className="text-xs text-slate-400">
                    Raw value: <span className="text-white">{Number(metric.raw).toFixed(3)}</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    <span className="text-white">{metric.courts}</span> courts •{" "}
                    <span className="text-white">{metric.cases}</span> cases
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-8 shadow-[0_20px_70px_rgba(15,23,42,0.55)] backdrop-blur">
          <h2 className="text-xl font-semibold text-white">
            Court-Level Analysis
          </h2>
          <div className="mt-6 space-y-4">
            {courtsData.map((court) => (
              <div
                key={court.name}
                className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-800/40 p-4"
              >
                <div className="flex-1">
                  <p className="font-semibold text-white">{court.name}</p>
                  <p className="text-sm text-slate-400">
                    {court.cases} cases analyzed
                  </p>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-sm text-slate-400">Bias Score</p>
                    <p className={`text-lg font-bold ${getStatusColor(court.status)}`}>
                      {court.biasScore.toFixed(1)}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-4 py-2 text-xs font-semibold ${
                      court.status === "Low Risk"
                        ? "bg-emerald-400/20 text-emerald-400"
                        : court.status === "Moderate Risk"
                        ? "bg-yellow-400/20 text-yellow-400"
                        : "bg-red-400/20 text-red-400"
                    }`}
                  >
                    {court.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-8 shadow-[0_20px_70px_rgba(15,23,42,0.55)] backdrop-blur">
          <h2 className="text-xl font-semibold text-white">
            Export & Reports
          </h2>
          <div className="mt-6 flex flex-wrap gap-4">
            <button className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-6 py-3 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-400/20">
              Generate Full Report
            </button>
            <button className="rounded-lg border border-white/20 bg-slate-800/40 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800/60">
              Export CSV Data
            </button>
            <button className="rounded-lg border border-white/20 bg-slate-800/40 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800/60">
              Schedule Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
