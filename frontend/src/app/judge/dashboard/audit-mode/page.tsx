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

export default function AuditModePage() {
  const [report, setReport] = useState<AuditReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [judgeMetrics, setJudgeMetrics] = useState<any>(null);
  const [metricsErr, setMetricsErr] = useState<string | null>(null);

  useEffect(() => {
    const fetchAudit = async () => {
      try {
        setLoading(true);

        const res = await apiFetch("/audit-report", { cache: "no-store" });

        const data = await res.json();

        if (!res.ok || data.error) {
          throw new Error(data.error || "Failed to fetch audit report");
        }

        setReport(data);
      } catch (err: unknown) {
        setReport({
          DP: 0,
          EO: 0,
          "Bias Score": 0,
          "Bias Level": "Low",
          cases_used: 0,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchAudit();
  }, []);

  useEffect(() => {
    const fetchJudgeMetrics = async () => {
      try {
        const res = await apiFetch("/judge/metrics/me", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.detail || "Failed to fetch judge metrics");
        setJudgeMetrics(data);
      } catch (e) {
        setMetricsErr(e instanceof Error ? e.message : "Unknown error");
      }
    };
    fetchJudgeMetrics();
  }, []);

  const getStatusColor = (status: string) => {
    if (status === "Low") return "text-emerald-400";
    if (status === "Moderate") return "text-yellow-400";
    return "text-red-400";
  };

  const getScoreColor = (score: number) => {
    if (score < 0.1) return "text-emerald-400";
    if (score < 0.3) return "text-yellow-400";
    return "text-red-400";
  };

  // convert 0-1 score to 0-10 for UI
  const overallScore10 = useMemo(() => {
    if (!report) return 0;
    return Math.min(10, Math.max(0, report["Bias Score"] * 10));
  }, [report]);

  const biasMetrics = useMemo(() => {
    if (!report) return [];

    return [
      {
        category: "Demographic Parity (DP)",
        value: report.DP,
        description: "Prediction rate difference across regions. Closer to 0 is fairer.",
      },
      {
        category: "Equalized Odds (EO)",
        value: report.EO,
        description: "Error rate difference across regions. Closer to 0 is fairer.",
      },
      {
        category: "Overall Bias Score",
        value: report["Bias Score"],
        description: "Average of DP and EO used to classify bias level.",
      },
    ];
  }, [report]);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-12 flex flex-col gap-8">

        <div>
          <Link href="/judge/dashboard" className="text-sm text-slate-400 hover:text-white">
            ← Back to Dashboard
          </Link>
          <h1 className="mt-4 text-3xl font-semibold">Audit Mode</h1>
          <p className="text-sm text-slate-300">
            Fairness and bias analysis from AI model
          </p>
        </div>

        {/* OVERALL SCORE */}
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-8">
          {loading ? (
            <p>Loading audit report...</p>
          ) : report?.error ? (
            <p className="text-red-400">{report.error}</p>
          ) : (
            <>
              <p className="text-xs uppercase tracking-widest text-sky-300">
                Overall Bias Score
              </p>

              <div className="mt-4 flex items-baseline gap-4">
                <span className={`text-5xl font-bold ${getScoreColor(report!["Bias Score"])}`}>
                  {overallScore10.toFixed(2)}
                </span>
                <span className="text-slate-400">/ 10</span>

                <span
                  className={`ml-auto px-4 py-2 rounded-full text-sm font-semibold ${
                    report!["Bias Level"] === "Low"
                      ? "bg-emerald-400/20 text-emerald-400"
                      : report!["Bias Level"] === "Moderate"
                      ? "bg-yellow-400/20 text-yellow-400"
                      : "bg-red-400/20 text-red-400"
                  }`}
                >
                  {report!["Bias Level"]} Risk
                </span>
              </div>

              <p className="mt-2 text-sm text-slate-300">
                Cases analyzed: <span className="text-white">{report!.cases_used}</span>
              </p>
            </>
          )}
        </div>

        
        {!loading && report && !report.error && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {biasMetrics.map((metric) => (
              <div
                key={metric.category}
                className="rounded-2xl border border-white/10 bg-slate-900/40 p-6"
              >
                <h3 className="text-lg font-semibold">{metric.category}</h3>

                <p className="mt-4 text-3xl font-bold">
                  {Number(metric.value).toFixed(3)}
                </p>

                <p className="mt-3 text-sm text-slate-300">
                  {metric.description}
                </p>

                <p className="mt-4 text-xs text-slate-400">
                  Cases: {report.cases_used}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-8">
          <h2 className="text-xl font-semibold text-white">Judge vs AI Audit</h2>
          {metricsErr && <p className="mt-2 text-sm text-red-400">{metricsErr}</p>}
          {!metricsErr && !judgeMetrics && <p className="mt-2 text-sm text-slate-300">Loading judge metrics...</p>}
          {judgeMetrics && (
            <>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-slate-800/40 p-4">
                  <p className="text-xs text-slate-400">Cases with AI</p>
                  <p className="mt-1 text-2xl font-bold">{judgeMetrics.total_cases_with_ai}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-800/40 p-4">
                  <p className="text-xs text-slate-400">Decisions submitted</p>
                  <p className="mt-1 text-2xl font-bold">{judgeMetrics.decided_cases}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-800/40 p-4">
                  <p className="text-xs text-slate-400">Agreement rate</p>
                  <p className="mt-1 text-2xl font-bold">
                    {judgeMetrics.agreement_rate == null ? "N/A" : `${Math.round(judgeMetrics.agreement_rate * 100)}%`}
                  </p>
                </div>
              </div>

              <div className="mt-6 rounded-lg border border-white/10 bg-slate-800/30 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-400">Disparity signals (your decisions)</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-white/10 bg-slate-900/30 p-3">
                    <p className="text-xs text-slate-400">Grant-rate disparity (gender)</p>
                    <p className="mt-1 text-lg font-semibold text-white">
                      {judgeMetrics.judge_grant_rate_disparity_gender == null
                        ? "N/A"
                        : `${Math.round(judgeMetrics.judge_grant_rate_disparity_gender * 100)}pp`}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-slate-900/30 p-3">
                    <p className="text-xs text-slate-400">Grant-rate disparity (region)</p>
                    <p className="mt-1 text-lg font-semibold text-white">
                      {judgeMetrics.judge_grant_rate_disparity_region == null
                        ? "N/A"
                        : `${Math.round(judgeMetrics.judge_grant_rate_disparity_region * 100)}pp`}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-slate-900/30 p-3">
                    <p className="text-xs text-slate-400">Override disparity (gender)</p>
                    <p className="mt-1 text-lg font-semibold text-white">
                      {judgeMetrics.override_disparity_gender == null
                        ? "N/A"
                        : `${Math.round(judgeMetrics.override_disparity_gender * 100)}pp`}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-slate-900/30 p-3">
                    <p className="text-xs text-slate-400">Override disparity (region)</p>
                    <p className="mt-1 text-lg font-semibold text-white">
                      {judgeMetrics.override_disparity_region == null
                        ? "N/A"
                        : `${Math.round(judgeMetrics.override_disparity_region * 100)}pp`}
                    </p>
                  </div>
                </div>

                {Array.isArray(judgeMetrics.flags) && judgeMetrics.flags.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs text-slate-400">Flags</p>
                    <ul className="mt-2 list-disc list-inside text-sm text-amber-200">
                      {judgeMetrics.flags.map((f: string, i: number) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
