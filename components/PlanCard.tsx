"use client";

import { useState } from "react";
import Link from "next/link";
import type { Plan } from "@/lib/coach";

const MODE_LABEL: Record<Plan["mode"], string> = {
  rest: "Rest day",
  active_recovery: "Active recovery",
  easy_endurance: "Easy endurance",
  long_endurance: "Long endurance",
  tempo: "Tempo",
  threshold: "Threshold",
  vo2max: "VO₂max intervals",
  strength: "Strength",
  mobility: "Mobility",
};

export default function PlanCard({ initialPlan }: { initialPlan: Plan | null }) {
  const [plan, setPlan] = useState(initialPlan);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function regenerate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/plan", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed");
      setPlan(body.plan);
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  }

  if (!plan) {
    return (
      <div className="card">
        <h2>Today&apos;s plan</h2>
        <p className="muted">
          No plan yet today. It arrives automatically once WHOOP scores your recovery, or at the daily fallback time.
        </p>
        {error && <div className="notice">{error}</div>}
        <button className="btn primary block" onClick={regenerate} disabled={busy}>
          {busy ? "Your coach is thinking…" : "Get today's plan now"}
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="row between">
        <h2 style={{ margin: 0 }}>Today&apos;s plan</h2>
        <span className="badge">
          <span className={`dot ${plan.readiness}`} />
          {plan.readiness === "green" ? "Ready" : plan.readiness === "yellow" ? "Moderate" : "Recover"}
        </span>
      </div>
      <div className="plan-mode">{MODE_LABEL[plan.mode]}</div>
      <div className="plan-meta">
        {plan.workout.sport} · {Math.round(plan.workout.duration_min)} min · {plan.workout.intensity}
      </div>
      <p style={{ margin: "0 0 8px" }}>{plan.summary}</p>
      <ol className="steps">
        {plan.workout.structure.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      {plan.alternatives.length > 0 && (
        <>
          <h2 style={{ marginTop: 14 }}>Alternatives</h2>
          <ul className="steps">
            {plan.alternatives.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </>
      )}
      <details style={{ marginTop: 10 }}>
        <summary className="muted small">Why this plan?</summary>
        <ul className="steps small">
          {plan.rationale.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
        {plan.recovery_tips.length > 0 && (
          <>
            <div className="muted small" style={{ marginTop: 6 }}>Recovery tips</div>
            <ul className="steps small">
              {plan.recovery_tips.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </>
        )}
      </details>
      {error && <div className="notice" style={{ marginTop: 10 }}>{error}</div>}
      <div className="row" style={{ marginTop: 12 }}>
        <Link className="btn primary" href={`/chat?q=${encodeURIComponent("Let's talk about today's plan.")}`}>
          Ask the coach
        </Link>
        <button className="btn" onClick={regenerate} disabled={busy}>
          {busy ? "Thinking…" : "Regenerate"}
        </button>
      </div>
    </div>
  );
}
