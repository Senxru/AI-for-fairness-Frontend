"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";

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
  const [generating, setGenerating] = useState(false);
  const [judgeTable, setJudgeTable] = useState<any[] | null>(null);
  const [judgeTableErr, setJudgeTableErr] = useState<string | null>(null);


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

  useEffect(() => {
    const fetchJudges = async () => {
      try {
        const res = await apiFetch("/authority/metrics/judges", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.detail || "Failed to fetch judge table");
        setJudgeTable(Array.isArray(data?.judges) ? data.judges : []);
      } catch (e) {
        setJudgeTableErr(e instanceof Error ? e.message : "Unknown error");
      }
    };
    fetchJudges();
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

  const generateFullReport = async () => {
    setGenerating(true);
    try {
      const now = new Date();
      const ts = now.toISOString();

      const storedPred =
        sessionStorage.getItem("ai_judge_prediction_result") ||
        localStorage.getItem("ai_judge_prediction_result");
      const storedPayload =
        sessionStorage.getItem("ai_judge_last_payload") ||
        localStorage.getItem("ai_judge_last_payload");

      const pred = storedPred ? (JSON.parse(storedPred) as any) : null;
      const payload = storedPayload ? (JSON.parse(storedPayload) as any) : null;

      const lines: string[] = [];
      lines.push(`AI for Fairness — Full Report`);
      lines.push(`Generated: ${ts}`);
      lines.push("");

      lines.push(`Bias Detection (System-wide)`);
      if (!report || report.error) {
        lines.push(`Status: unavailable`);
        lines.push(`Error: ${report?.error ?? "No report loaded"}`);
      } else {
        lines.push(`Bias Level: ${report["Bias Level"]}`);
        lines.push(`Bias Score: ${report["Bias Score"]}`);
        lines.push(`DP: ${report.DP}`);
        lines.push(`EO: ${report.EO}`);
        lines.push(`Cases used: ${report.cases_used}`);
      }
      lines.push("");

      lines.push(`Latest AI Judge Case Analysis`);
      if (!pred || pred.error) {
        lines.push(`Status: unavailable`);
        lines.push(`Error: ${pred?.error ?? "No prediction stored yet"}`);
      } else {
        lines.push(`Decision: ${pred.decision ?? "N/A"}`);
        lines.push(`Confidence: ${pred.confidence ?? "N/A"}`);
        lines.push(`P(Bail Granted): ${pred.prob_granted ?? "N/A"}`);
        lines.push(`P(Bail Rejected): ${pred.prob_rejected ?? "N/A"}`);
        if (payload) {
          lines.push("");
          lines.push(`Case Inputs (latest)`);
          for (const [k, v] of Object.entries(payload)) {
            lines.push(`- ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
          }
        }

        const feats = Array.isArray(pred.top_features) ? pred.top_features : [];
        lines.push("");
        lines.push(`Top Features Influencing Prediction (SHAP)`);
        if (feats.length === 0) {
          lines.push(`(No SHAP features available)`);
          if (pred.shap_error) lines.push(`SHAP error: ${pred.shap_error}`);
        } else {
          for (const f of feats.slice(0, 10)) {
            lines.push(`- ${f.feature}: ${Number(f.weight).toFixed(3)}`);
          }
        }
      }

      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 48;
      const maxWidth = pageWidth - margin * 2;
      const lineHeight = 14;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);

      const text = lines.join("\n");
      const wrapped = doc.splitTextToSize(text, maxWidth);

      let y = margin;
      for (const line of wrapped) {
        if (y > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
        doc.text(line, margin, y);
        y += lineHeight;
      }

      doc.save(`ai-for-fairness-full-report-${now.toISOString().replace(/[:.]/g, "-")}.pdf`);
    } finally {
      setGenerating(false);
    }
  };

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
            <button
              onClick={generateFullReport}
              disabled={generating}
              className="rounded-lg border border-emerald-400/30 bg-emerald-10 px-6 py-3 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {generating ? "Generating..." : "Generate Full Report"}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-8 shadow-[0_20px_70px_rgba(15,23,42,0.55)] backdrop-blur">
          <h2 className="text-xl font-semibold text-white">Judge vs AI Overview</h2>
          <div className="mt-3 flex flex-wrap gap-3 text-xs">
            <span className="rounded-full border border-slate-400/30 bg-slate-400/10 px-3 py-1 text-slate-200">
              Gray: Insufficient data (&lt; 10 cases)
            </span>
            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-emerald-300">
              Green: No bias signals
            </span>
            <span className="rounded-full border border-yellow-400/30 bg-yellow-400/10 px-3 py-1 text-yellow-300">
              Yellow: Potential bias detected
            </span>
            <span className="rounded-full border border-red-400/30 bg-red-400/10 px-3 py-1 text-red-300">
              Red: High bias detected
            </span>
          </div>
          {judgeTableErr && <p className="mt-2 text-sm text-red-400">{judgeTableErr}</p>}
          {!judgeTableErr && !judgeTable && <p className="mt-2 text-sm text-slate-300">Loading judge stats...</p>}
          {judgeTable && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="text-slate-300">
                  <tr className="border-b border-white/10">
                    <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Judge</th>
                    <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Decided</th>
                    <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Agreement</th>
                    <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Disagreement</th>
                    <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Grant Δ gender</th>
                    <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Grant Δ region</th>
                    <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Override Δ gender</th>
                    <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Override Δ region</th>
                    <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Flags</th>
                    <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Grant rates (gender)</th>
                    <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Grant rates (region)</th>
                  </tr>
                </thead>
                <tbody className="text-slate-200">
                  {judgeTable.map((j) => (
                    <tr key={j.judge_user_id} className="border-b border-white/5">
                      <td className="px-3 py-3">
                        {(() => {
                          const level = j.bias_level as string | undefined;
                          const cls =
                            level === "high"
                              ? "text-red-300"
                              : level === "moderate" || level === "normal"
                                ? "text-yellow-300"
                                : level === "insufficient"
                                  ? "text-slate-200"
                                : "text-emerald-300";
                          const label =
                            level === "high"
                              ? "High bias detected"
                              : level === "moderate" || level === "normal"
                                ? "Potential bias detected"
                                : level === "insufficient"
                                  ? "Insufficient data (< 10 cases)"
                                : "No bias signals";
                          return (
                            <>
                              <div className={`font-medium ${cls}`}>{j.full_name || j.username}</div>
                              <div className={`mt-1 text-[11px] ${cls}`}>{label}</div>
                            </>
                          );
                        })()}
                        <div className="text-xs text-slate-400">{j.username}</div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">{j.decided_cases}</td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {j.agreement_rate == null ? "N/A" : `${Math.round(j.agreement_rate * 100)}%`}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {j.disagreement_rate == null ? "N/A" : `${Math.round(j.disagreement_rate * 100)}%`}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {j.grant_rate_disparity_gender == null ? "N/A" : `${Math.round(j.grant_rate_disparity_gender * 100)}pp`}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {j.grant_rate_disparity_region == null ? "N/A" : `${Math.round(j.grant_rate_disparity_region * 100)}pp`}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {j.override_disparity_gender == null ? "N/A" : `${Math.round(j.override_disparity_gender * 100)}pp`}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {j.override_disparity_region == null ? "N/A" : `${Math.round(j.override_disparity_region * 100)}pp`}
                      </td>
                      <td className="px-3 py-3 text-xs text-amber-200">
                        {Array.isArray(j.flags) && j.flags.length > 0 ? j.flags.join("; ") : ""}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-200 whitespace-normal break-words">
                        {j.grant_rate_by_gender
                          ? Object.entries(j.grant_rate_by_gender)
                              .filter(([, v]: any) => v !== null && v !== undefined)
                              .slice(0, 4)
                              .map(([k, v]: any) => `${k}: ${Math.round((v as number) * 100)}%`)
                              .join(", ")
                          : "N/A"}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-200 whitespace-normal break-words">
                        {j.grant_rate_by_region
                          ? Object.entries(j.grant_rate_by_region)
                              .filter(([, v]: any) => v !== null && v !== undefined)
                              .slice(0, 4)
                              .map(([k, v]: any) => `${k}: ${Math.round((v as number) * 100)}%`)
                              .join(", ")
                          : "N/A"}
                      </td>
                    </tr>
                  ))}
                  {judgeTable.length === 0 && (
                    <tr>
                      <td className="px-3 py-3 text-slate-400" colSpan={11}>
                        No judge decisions recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
