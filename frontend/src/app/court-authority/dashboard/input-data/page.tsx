"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api";

export default function InputDataPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    date: "",
    accused_gender: "male",
    region: "",
    court: "",
    facts: "",
    legal_issues: "",
    judgment_reason: "",
    summary: "",
    crime_type: "",
    ipc_sections: "",
    prior_cases: 0,
  });

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

 const handleChange = (
  e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
) => {
  const { name, value } = e.target;

  if (name === "prior_cases") {
    setForm((prev) => ({
      ...prev,
      [name]: value === "" ? 0 : Number(value), // ✅ convert to number
    }));
  } else {
    setForm((prev) => ({ ...prev, [name]: value }));
  }
};

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
      const bodyToSend = {
        ...form,
        prior_cases: Number(form.prior_cases),
      };

      const res = await apiFetch("/predict", {
        method: "POST",
        body: JSON.stringify(bodyToSend),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setErrorMsg(data.error || "Prediction failed");
        return;
      }

      if (data.case_id) {
        sessionStorage.setItem("ai_judge_last_case_id", String(data.case_id));
        localStorage.setItem("ai_judge_last_case_id", String(data.case_id));
      }

      sessionStorage.setItem("ai_judge_last_payload", JSON.stringify(bodyToSend));
      sessionStorage.setItem("ai_judge_prediction_result", JSON.stringify(data));
      // also persist for report generation across pages/tabs
      localStorage.setItem("ai_judge_last_payload", JSON.stringify(bodyToSend));
      localStorage.setItem("ai_judge_prediction_result", JSON.stringify(data));
      router.push("/judge/dashboard/ai-judge-mode");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const inputStyles =
    "w-full rounded-lg border border-white/20 bg-slate-800/40 px-4 py-3 text-sm text-white focus:border-emerald-400 focus:outline-none";

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8">
      <h1 className="text-3xl font-semibold mb-6">Input Case Data</h1>

      {errorMsg && (
        <p className="mb-4 text-red-400 border border-red-400/30 p-3 rounded-lg">
          {errorMsg}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">

        <input type="date" name="date" required className={inputStyles}
          value={form.date} onChange={handleChange} />

        <select name="accused_gender" required className={inputStyles}
          value={form.accused_gender} onChange={handleChange}>
          <option value="male">male</option>
          <option value="female">female</option>
          <option value="unknown">unknown</option>
        </select>

        <input name="region" required placeholder="Region"
          className={inputStyles} value={form.region} onChange={handleChange} />

        <input name="court" required placeholder="Court"
          className={inputStyles} value={form.court} onChange={handleChange} />

        <input name="crime_type" placeholder="Crime Type"
          className={inputStyles} value={form.crime_type} onChange={handleChange} />

        <input name="ipc_sections" placeholder="IPC Sections"
          className={inputStyles} value={form.ipc_sections} onChange={handleChange} />

        <input type="number" name="prior_cases" placeholder="Prior Cases"
          className={inputStyles} value={form.prior_cases} onChange={handleChange} />

        <textarea name="facts" required rows={4}
          placeholder="Case Facts"
          className={inputStyles} value={form.facts} onChange={handleChange} />

        <textarea name="legal_issues" rows={2}
          placeholder="Legal Issues"
          className={inputStyles} value={form.legal_issues} onChange={handleChange} />

        <textarea name="judgment_reason" rows={2}
          placeholder="Judgment Reason"
          className={inputStyles} value={form.judgment_reason} onChange={handleChange} />

        <textarea name="summary" rows={2}
          placeholder="Summary"
          className={inputStyles} value={form.summary} onChange={handleChange} />

        <button
          type="submit"
          disabled={loading}
          className="bg-emerald-500 px-6 py-3 rounded-lg text-black font-semibold"
        >
          {loading ? "Predicting..." : "Submit & Predict"}
        </button>
      </form>
    </div>
  );
}