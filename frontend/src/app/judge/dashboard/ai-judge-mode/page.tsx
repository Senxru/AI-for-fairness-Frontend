"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type PredictResponse =
  | {
      decision: string;
      confidence: number;
      prob_granted: number;
      prob_rejected: number;
      received_keys: string[];
      top_features?: { feature: string; weight: number }[]; // new model explanation
      shap_error?: string | null;
      case_id?: number;
    }
  | { error: string; received_keys?: string[] };

type LastPayload = {
  case_id?: string;
  title?: string;
  crime_type?: string;
  facts?: string;
  region?: string;
  accused_gender?: string;
  date?: string;
  legal_issues?: string;
  judgment_reason?: string;
  summary?: string;
};

type RecentCaseItem = {
  id: string;
  title: string;
  status: string;
  aiRecommendation: string;
  confidence: number;
  prob_granted: number;
  prob_rejected: number;
  top_features: { feature: string; weight: number }[];
};

export default function AIJudgeModePage() {
  const [result, setResult] = useState<PredictResponse | null>(null);
  const [payload, setPayload] = useState<LastPayload | null>(null);
  const [caseId, setCaseId] = useState<number | null>(null);
  const [judgeDecision, setJudgeDecision] = useState<"Bail Granted" | "Bail Rejected" | "">("");
  const [judgeNotes, setJudgeNotes] = useState("");
  const [savingDecision, setSavingDecision] = useState(false);
  const [decisionSavedMsg, setDecisionSavedMsg] = useState<string | null>(null);
  const [decisionErr, setDecisionErr] = useState<string | null>(null);

  // Read prediction result + payload from sessionStorage
  useEffect(() => {
    const stored = sessionStorage.getItem("ai_judge_prediction_result");
    const storedPayload = sessionStorage.getItem("ai_judge_last_payload");
    const storedCaseId =
      sessionStorage.getItem("ai_judge_last_case_id") ||
      localStorage.getItem("ai_judge_last_case_id");

    setTimeout(() => {
      if (stored) setResult(JSON.parse(stored));
      if (storedPayload) setPayload(JSON.parse(storedPayload));
      if (storedCaseId) setCaseId(Number(storedCaseId));
    }, 0);
  }, []);

  const submitJudgeDecision = async () => {
    if (!caseId || !judgeDecision) return;
    setSavingDecision(true);
    setDecisionErr(null);
    setDecisionSavedMsg(null);
    try {
      const res = await apiFetch("/judge/decision", {
        method: "POST",
        body: JSON.stringify({ case_id: caseId, decision: judgeDecision, notes: judgeNotes || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.detail || "Failed to save decision");
      }
      setDecisionSavedMsg("Decision saved.");
    } catch (e) {
      setDecisionErr(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSavingDecision(false);
    }
  };

  const getConfidenceColor = (confidencePercent: number) => {
    if (confidencePercent >= 85) return "text-emerald-400";
    if (confidencePercent >= 70) return "text-yellow-400";
    return "text-orange-400";
  };

  // Convert backend confidence (0..1) into %
  const confidencePercent = useMemo(() => {
    if (!result || "error" in result) return null;
    return Math.round((result.confidence ?? 0) * 100);
  }, [result]);

  const recentCases = useMemo<RecentCaseItem[]>(() => {
    if (!result) return [];

    if ("error" in result) {
      return [
        {
          id: "AI-ERROR",
          title: "Prediction Failed",
          status: "Backend Error",
          aiRecommendation: "N/A",
          confidence: 0,
          prob_granted: 0,
          prob_rejected: 0,
          top_features: [],
        },
      ];
    }

    const id = payload?.case_id || "AI-PREDICTION";
    const title =
      payload?.title ||
      (payload?.crime_type
        ? `Case Type: ${String(payload.crime_type)}`
        : "Submitted Case");

    const aiRecommendation =
      result.decision === "Bail Granted" ? "Grant Bail" : "Reject Bail";

    return [
      {
        id: String(id),
        title: String(title),
        status: "Ready for Decision",
        aiRecommendation,
        confidence: Math.max(
          0,
          Math.min(100, Math.round((result.confidence ?? 0) * 100))
        ),
        prob_granted: Math.round((result.prob_granted ?? 0) * 100),
        prob_rejected: Math.round((result.prob_rejected ?? 0) * 100),
        top_features: result.top_features ?? [],
      },
    ];
  }, [result, payload]);

  const activeCasesCount = 12; // dummy
  const avgConfidenceText =
    confidencePercent !== null ? `${confidencePercent}%` : "84%";
  const biasAlertCount = 0; // dummy

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-12">
        <div className="flex items-center justify-between">
          <div>
            <Link
              href="/judge/dashboard"
              className="text-sm text-slate-400 transition hover:text-white"
            >
              ← Back to Dashboard
            </Link>
            <h1 className="mt-4 text-3xl font-semibold leading-tight text-white">
              AI Judge Mode
            </h1>
            <p className="mt-2 text-sm text-slate-300">
              AI-powered decision support and case analysis
            </p>
          </div>
        </div>

        {/* Top Summary Cards */}
        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.55)] backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-300">
              Active Cases
            </p>
            <p className="mt-4 text-4xl font-bold text-white">{activeCasesCount}</p>
            <p className="mt-2 text-sm text-slate-400">Under AI review</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.55)] backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-300">
              Avg. Confidence
            </p>
            <p className="mt-4 text-4xl font-bold text-white">{avgConfidenceText}</p>
            <p className="mt-2 text-sm text-slate-400">AI recommendations</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.55)] backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-300">
              Bias Alert
            </p>
            <p className="mt-4 text-4xl font-bold text-emerald-400">{biasAlertCount}</p>
            <p className="mt-2 text-sm text-slate-400">Critical issues</p>
          </div>
        </div>

        {/* Recent Cases */}
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-8 shadow-[0_20px_70px_rgba(15,23,42,0.55)] backdrop-blur">
          <h2 className="text-xl font-semibold text-white">Recent Cases with AI Analysis</h2>

          {!result && (
            <p className="mt-2 text-sm text-slate-400">
              No submitted case result found yet. Submit a case from Court Authority → Input Data.
            </p>
          )}

          {result && "error" in result && (
            <p className="mt-2 text-sm text-red-400">
              Backend error: {result.error}
            </p>
          )}

          <div className="mt-6 space-y-4">
            {recentCases.map((caseItem) => (
              <div
                key={caseItem.id}
                className="rounded-lg border border-white/10 bg-slate-800/40 p-6 transition hover:border-sky-400/50"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-white">{caseItem.title}</h3>
                      <span className="rounded-full bg-sky-400/20 px-3 py-1 text-xs font-semibold text-sky-300">
                        {caseItem.id}
                      </span>
                    </div>

                    <p className="mt-2 text-sm text-slate-300">Status: {caseItem.status}</p>

                    <div className="mt-4 flex gap-6">
                      <div>
                        <p className="text-xs text-slate-400">AI Recommendation</p>
                        <p className="mt-1 font-semibold text-white">{caseItem.aiRecommendation}</p>
                      </div>

                      <div>
                        <p className="text-xs text-slate-400">Confidence</p>
                        <p className={`mt-1 font-semibold ${getConfidenceColor(caseItem.confidence)}`}>
                          {caseItem.confidence}%
                        </p>
                      </div>
                    </div>

                    {/* Probability Breakdown */}
                    {result && !("error" in result) && (
                      <div className="mt-6 space-y-3">
                        <p className="text-xs uppercase tracking-wide text-slate-400">
                          Probability Breakdown
                        </p>

                        <div>
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-300">Bail Granted</span>
                            <span className="text-emerald-400 font-semibold">{caseItem.prob_granted}%</span>
                          </div>
                          <div className="mt-1 h-3 w-full rounded-full bg-slate-700">
                            <div
                              className="h-3 rounded-full bg-emerald-500 transition-all"
                              style={{ width: `${caseItem.prob_granted}%` }}
                            />
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-300">Bail Rejected</span>
                            <span className="text-red-400 font-semibold">{caseItem.prob_rejected}%</span>
                          </div>
                          <div className="mt-1 h-3 w-full rounded-full bg-slate-700">
                            <div
                              className="h-3 rounded-full bg-red-500 transition-all"
                              style={{ width: `${caseItem.prob_rejected}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Model Explanation (Top Features) */}
                    {caseItem.top_features && caseItem.top_features.length > 0 && (
                      <div className="mt-6">
                        <p className="text-xs uppercase tracking-wide text-slate-400">Top Features Influencing Prediction</p>
                        <ul className="mt-2 list-disc list-inside text-sm text-slate-300">
                          {caseItem.top_features.slice(0, 5).map((f, idx) => (
                            <li key={idx}>
                              <span className="text-white font-medium">{f.feature}</span>: {f.weight.toFixed(3)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* SHAP error (debug) */}
                    {result && !("error" in result) && (!caseItem.top_features || caseItem.top_features.length === 0) && result.shap_error && (
                      <p className="mt-4 text-xs text-amber-300">
                        Explanation unavailable: {result.shap_error}
                      </p>
                    )}

                    {/* Judge decision capture */}
                    {caseId && (
                      <div className="mt-6 rounded-lg border border-white/10 bg-slate-900/30 p-4">
                        <p className="text-xs uppercase tracking-wide text-slate-400">Judge Decision</p>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <select
                            value={judgeDecision}
                            onChange={(e) => setJudgeDecision(e.target.value as any)}
                            className="rounded-lg border border-white/20 bg-slate-800/40 px-3 py-2 text-sm text-white focus:border-sky-400 focus:outline-none"
                          >
                            <option value="">Select decision…</option>
                            <option value="Bail Granted">Bail Granted</option>
                            <option value="Bail Rejected">Bail Rejected</option>
                          </select>
                          <button
                            type="button"
                            onClick={submitJudgeDecision}
                            disabled={!judgeDecision || savingDecision}
                            className="rounded-lg border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-sm font-semibold text-sky-300 transition hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {savingDecision ? "Saving..." : "Save decision"}
                          </button>
                          <span className="text-xs text-slate-400">Case ID: {caseId}</span>
                        </div>

                        <textarea
                          value={judgeNotes}
                          onChange={(e) => setJudgeNotes(e.target.value)}
                          rows={3}
                          placeholder="Optional notes / reasoning"
                          className="mt-3 w-full rounded-lg border border-white/20 bg-slate-800/40 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                        />

                        {decisionSavedMsg && <p className="mt-2 text-xs text-emerald-300">{decisionSavedMsg}</p>}
                        {decisionErr && <p className="mt-2 text-xs text-red-300">{decisionErr}</p>}
                      </div>
                    )}
                  </div>

                  <button className="ml-4 rounded-lg border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-sm font-semibold text-sky-300 transition hover:bg-sky-400/20">
                    View Details
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}