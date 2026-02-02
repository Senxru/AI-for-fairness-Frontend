"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type PredictResponse =
  | {
      decision: string;
      confidence: number; // 0..1 or 0..something (yours is 0..1 rounded)
      prob_granted: number;
      prob_rejected: number;
      received_keys: string[];
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
export default function AIJudgeModePage() {
  const [result, setResult] = useState<PredictResponse | null>(null);
  const [payload, setPayload] = useState<LastPayload | null>(null);

  // Read prediction result + payload from sessionStorage
  useEffect(() => {
  const stored = sessionStorage.getItem("ai_judge_prediction_result");
  const storedPayload = sessionStorage.getItem("ai_judge_last_payload");

  setTimeout(() => {
    if (stored) setResult(JSON.parse(stored));
    if (storedPayload) setPayload(JSON.parse(storedPayload));
  }, 0);
}, []);

  const getConfidenceColor = (confidencePercent: number) => {
    if (confidencePercent >= 85) return "text-emerald-400";
    if (confidencePercent >= 70) return "text-yellow-400";
    return "text-orange-400";
  };

  const getBiasColor = (score: number) => {
    if (score < 3) return "text-emerald-400";
    if (score < 5) return "text-yellow-400";
    return "text-red-400";
  };

  // Convert backend confidence (0..1) into %
  const confidencePercent = useMemo(() => {
    if (!result || "error" in result) return null;
    return Math.round((result.confidence ?? 0) * 100);
  }, [result]);

  // Build ONE "recent case" item using the prediction result (keeping your UI layout)
  const recentCases = useMemo(() => {
    // If no result yet, return your old dummy list or an empty list
    if (!result) {
      return [
        {
          id: "C-2024-001",
          title: "Contract Dispute - Employment",
          status: "Pending Review",
          aiRecommendation: "Neutral",
          confidence: 87,
          biasScore: 2.1,
        },
        {
          id: "C-2024-002",
          title: "Property Rights Case",
          status: "Under Analysis",
          aiRecommendation: "Favor Plaintiff",
          confidence: 73,
          biasScore: 3.4,
        },
        {
          id: "C-2024-003",
          title: "Family Law - Custody",
          status: "Ready for Decision",
          aiRecommendation: "Neutral",
          confidence: 92,
          biasScore: 1.9,
        },
      ];
    }

    // If backend returned error, show one card indicating error (still same UI)
    if ("error" in result) {
      return [
        {
          id: "AI-ERROR",
          title: "Prediction Failed",
          status: "Backend Error",
          aiRecommendation: "N/A",
          confidence: 0,
          biasScore: 0,
        },
      ];
    }

    const id = payload?.case_id || "AI-PREDICTION";
    const title =
      payload?.title ||
      (payload?.crime_type
        ? `Case Type: ${String(payload.crime_type)}`
        : "Submitted Case");

    // Map backend decision to your UI labels
    const aiRecommendation =
      result.decision === "Bail Granted" ? "Grant Bail" : "Reject Bail";

    // Dummy biasScore for now (your /predict endpoint doesn’t return a bias score)
    // Later, if you add bias score to /predict, just replace this with result.bias_score
    const dummyBiasScore = 2.5;

    return [
      {
        id: String(id),
        title: String(title),
        status: "Ready for Decision",
        aiRecommendation,
        confidence: Math.max(0, Math.min(100, Math.round((result.confidence ?? 0) * 100))),
        biasScore: dummyBiasScore,
      },
    ];
  }, [result, payload]);

  // Top cards (keeping UI) - we can keep dummy numbers, but one can be driven from result
  const activeCasesCount = 12; // dummy
  const avgConfidenceText =
    confidencePercent !== null ? `${confidencePercent}%` : "84%"; // show real confidence if available
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

        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-8 shadow-[0_20px_70px_rgba(15,23,42,0.55)] backdrop-blur">
          <h2 className="text-xl font-semibold text-white">
            Recent Cases with AI Analysis
          </h2>

          {/* Optional: show a small note if no stored prediction */}
          {!result && (
            <p className="mt-2 text-sm text-slate-400">
              No submitted case result found yet. Submit a case from Court Authority → Input Data.
            </p>
          )}

          {/* Optional: show backend error message (but keep UI) */}
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
                      <h3 className="font-semibold text-white">
                        {caseItem.title}
                      </h3>
                      <span className="rounded-full bg-sky-400/20 px-3 py-1 text-xs font-semibold text-sky-300">
                        {caseItem.id}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-300">
                      Status: {caseItem.status}
                    </p>
                    <div className="mt-4 flex gap-6">
                      <div>
                        <p className="text-xs text-slate-400">AI Recommendation</p>
                        <p className="mt-1 font-semibold text-white">
                          {caseItem.aiRecommendation}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Confidence</p>
                        <p
                          className={`mt-1 font-semibold ${getConfidenceColor(caseItem.confidence)}`}
                        >
                          {caseItem.confidence}%
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Bias Score</p>
                        <p
                          className={`mt-1 font-semibold ${getBiasColor(caseItem.biasScore)}`}
                        >
                          {caseItem.biasScore.toFixed(1)}
                        </p>
                      </div>
                    </div>
                  </div>
                  <button className="ml-4 rounded-lg border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-sm font-semibold text-sky-300 transition hover:bg-sky-400/20">
                    View Details
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Keep your tools UI unchanged */}
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-8 shadow-[0_20px_70px_rgba(15,23,42,0.55)] backdrop-blur">
          <h2 className="text-xl font-semibold text-white">
            AI Analysis Tools
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <button className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-800/40 p-4 transition hover:border-sky-400/50 hover:bg-slate-800/60">
              <div>
                <p className="font-semibold text-white">Case Analyzer</p>
                <p className="text-sm text-slate-400">
                  Upload case documents for AI analysis
                </p>
              </div>
              <svg className="h-5 w-5 text-sky-300" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            <button className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-800/40 p-4 transition hover:border-sky-400/50 hover:bg-slate-800/60">
              <div>
                <p className="font-semibold text-white">Precedent Search</p>
                <p className="text-sm text-slate-400">
                  Find similar cases and rulings
                </p>
              </div>
              <svg className="h-5 w-5 text-sky-300" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            <button className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-800/40 p-4 transition hover:border-sky-400/50 hover:bg-slate-800/60">
              <div>
                <p className="font-semibold text-white">Bias Checker</p>
                <p className="text-sm text-slate-400">
                  Real-time bias detection for decisions
                </p>
              </div>
              <svg className="h-5 w-5 text-sky-300" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            <button className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-800/40 p-4 transition hover:border-sky-400/50 hover:bg-slate-800/60">
              <div>
                <p className="font-semibold text-white">Decision Assistant</p>
                <p className="text-sm text-slate-400">
                  Get AI-powered decision recommendations
                </p>
              </div>
              <svg className="h-5 w-5 text-sky-300" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
