"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { apiFetch } from "@/lib/api";

type PredictOk = {
  decision: string;
  confidence: number;
  prob_granted: number;
  prob_rejected: number;
  received_keys: string[];
};

type PredictErr = { error: string; received_keys?: string[] };
type PredictResponse = PredictOk | PredictErr;

export default function InputDataPage() {
  const router = useRouter();

  
  const [form, setForm] = useState({
    date: "",
    accused_gender: "male",
    region: "",
    facts: "", 
  });

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
     
      const bodyToSend = {
        date: form.date,
        accused_gender: form.accused_gender,
        region: form.region || "unknown",
        facts: form.facts,
      };

      const res = await apiFetch("/predict", {
        method: "POST",
        body: JSON.stringify(bodyToSend),
      });

      const data = (await res.json()) as PredictResponse;

      // show backend errors
      if (!res.ok || "error" in data) {
        const msg =
          "error" in data ? data.error : `Request failed with status ${res.status}`;
        setErrorMsg(msg);
        return;
      }

      //  store response for the AI Judge Mode page
      sessionStorage.setItem("ai_judge_prediction_result", JSON.stringify(data));
      sessionStorage.setItem("ai_judge_last_payload", JSON.stringify(bodyToSend));

      router.push("/judge/dashboard/ai-judge-mode");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  const inputStyles =
    "w-full rounded-lg border border-white/20 bg-slate-800/40 px-4 py-3 text-sm text-white placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none";

  const buttonStyles =
    "inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="relative mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-12">
        <div>
          <Link
            href="/court-authority/dashboard"
            className="text-sm text-slate-400 transition hover:text-white"
          >
            ← Back to Dashboard
          </Link>

          <h1 className="mt-4 text-3xl font-semibold leading-tight text-white">
            Input Case Data
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            Upload and manage case information for bias analysis
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-white/10 bg-slate-900/40 p-8 shadow-[0_20px_70px_rgba(15,23,42,0.55)] backdrop-blur"
        >
          <div className="space-y-6">
            {errorMsg && (
              <p className="rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-300">
                {errorMsg}
              </p>
            )}

            {/* Date */}
            <label className="block text-sm text-white">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Date Filed *
              </span>
              <input
                type="date"
                name="date"
                value={form.date}
                onChange={handleChange}
                className={inputStyles}
                required
              />
            </label>

            {/* Gender + Region */}
            <div className="grid gap-6 md:grid-cols-2">
              <label className="block text-sm text-white">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Accused Gender *
                </span>
                <select
                  name="accused_gender"
                  value={form.accused_gender}
                  onChange={handleChange}
                  className={inputStyles}
                  required
                >
                  <option value="male">male</option>
                  <option value="female">female</option>
                  <option value="unknown">unknown</option>
                </select>
              </label>

              <label className="block text-sm text-white">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Region *
                </span>
                <input
                  type="text"
                  name="region"
                  value={form.region}
                  onChange={handleChange}
                  placeholder="e.g., Maharashtra"
                  className={inputStyles}
                  required
                />
              </label>
            </div>

           
            <label className="block text-sm text-white">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Case Description * (Sent as Facts)
              </span>
              <textarea
                name="facts"
                value={form.facts}
                onChange={handleChange}
                placeholder="Enter the full case description here..."
                rows={6}
                className={inputStyles}
                required
              />
              <p className="mt-2 text-xs text-slate-400">
                This is sent to the backend as{" "}
                <span className="text-white">facts</span>.
              </p>
            </label>

            {/* Submit */}
            <div className="flex items-center justify-end pt-2">
              <button type="submit" className={buttonStyles} disabled={loading}>
                {loading ? "Predicting..." : "Submit & Predict"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
