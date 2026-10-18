"use client";

import { useEffect, useState } from "react";
import type { AthleteProfile } from "@/lib/context";

type Status = Record<"strava" | "whoop", { connected: boolean; detail: string }>;

async function post(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

export function Connections({ status }: { status: Status }) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(true);
    setMsg(`${label}…`);
    try {
      const r = await fn();
      setMsg(`${label}: done ${r ? JSON.stringify(r) : ""}`);
    } catch (err) {
      setMsg(`${label} failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      setBusy(false);
    }
  }

  const rows = [
    { key: "strava" as const, name: "Strava", color: "#fc4c02" },
    { key: "whoop" as const, name: "WHOOP", color: "#00c48c" },
  ];

  return (
    <div className="card">
      <h2>Data sources</h2>
      <ul className="list">
        {rows.map((r) => (
          <li key={r.key} style={{ alignItems: "center" }}>
            <span>
              <strong style={{ color: r.color }}>{r.name}</strong>
              <br />
              <span className="muted small">{status[r.key].connected ? status[r.key].detail : "Not connected"}</span>
            </span>
            {status[r.key].connected ? (
              <button
                className="btn"
                disabled={busy}
                onClick={() =>
                  confirm(`Disconnect ${r.name}?`) &&
                  run(`Disconnect ${r.name}`, async () => {
                    await post("/api/disconnect", { provider: r.key });
                    location.reload();
                  })
                }
              >
                Disconnect
              </button>
            ) : (
              <a className="btn primary" href={`/api/${r.key}/connect`}>
                Connect
              </a>
            )}
          </li>
        ))}
      </ul>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" disabled={busy} onClick={() => run("Sync last 14 days", () => post("/api/sync", { days: 14 }))}>
          Sync now
        </button>
        {status.strava.connected && (
          <button className="btn" disabled={busy} onClick={() => run("Enable Strava auto-upload", () => post("/api/strava/subscribe"))}>
            Enable Strava auto-upload
          </button>
        )}
      </div>
      <p className="muted small" style={{ marginBottom: 0 }}>
        New Strava activities and WHOOP sleep/recovery/workouts arrive automatically through webhooks. A daily sync runs as a
        safety net.
      </p>
      {msg && <div className="notice small" style={{ marginTop: 10, wordBreak: "break-word" }}>{msg}</div>}
    </div>
  );
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function Notifications({ vapidKey }: { vapidKey: string }) {
  const [state, setState] = useState<"loading" | "unsupported" | "off" | "on" | "denied">("loading");
  const [msg, setMsg] = useState("");
  const [isIOSBrowser, setIsIOSBrowser] = useState(false);

  useEffect(() => {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    setIsIOSBrowser(ios && !standalone);
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !vapidKey) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? "on" : "off"))
      .catch(() => setState("off"));
  }, [vapidKey]);

  async function enable() {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      await post("/api/push/subscribe", sub.toJSON());
      setState("on");
      setMsg("Notifications enabled on this device.");
    } catch (err) {
      setMsg(`Couldn't enable notifications: ${err instanceof Error ? err.message : err}`);
    }
  }

  async function disable() {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
    }
    setState("off");
  }

  return (
    <div className="card">
      <h2>Daily message</h2>
      <p className="small" style={{ marginTop: 0 }}>
        Each morning, once WHOOP scores your recovery, your coach sends today&apos;s training mode to this phone. If no
        recovery score comes in, the plan goes out at the daily fallback time.
      </p>
      {isIOSBrowser && (
        <div className="notice small">
          On iPhone: tap <strong>Share → Add to Home Screen</strong>, open the app from your home screen, then enable
          notifications here.
        </div>
      )}
      {state === "unsupported" && (
        <p className="muted small">
          {vapidKey ? "This browser doesn't support push notifications." : "Push is not configured on the server (VAPID keys missing)."}{" "}
          You can still use Telegram (see README).
        </p>
      )}
      {state === "denied" && <p className="muted small">Notifications are blocked in your browser settings.</p>}
      <div className="row">
        {state === "off" && (
          <button className="btn primary" onClick={enable}>
            Enable notifications
          </button>
        )}
        {state === "on" && (
          <>
            <button className="btn" onClick={() => post("/api/push/test").then(() => setMsg("Test sent."))}>
              Send test
            </button>
            <button className="btn" onClick={disable}>
              Turn off
            </button>
          </>
        )}
      </div>
      {msg && <div className="notice small" style={{ marginTop: 10 }}>{msg}</div>}
    </div>
  );
}

export function ProfileForm({ initial }: { initial: AthleteProfile }) {
  const [p, setP] = useState<AthleteProfile>(initial);
  const [saved, setSaved] = useState("");
  const set = (k: keyof AthleteProfile) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setP({ ...p, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
    setSaved(res.ok ? "Saved." : "Save failed.");
  }

  return (
    <form className="card" onSubmit={save}>
      <h2>Athlete profile</h2>
      <p className="muted small" style={{ marginTop: 0 }}>Your coach uses this together with your data.</p>
      <label className="field">
        <span>Name</span>
        <input value={p.name ?? ""} onChange={set("name")} />
      </label>
      <label className="field">
        <span>Goals</span>
        <textarea rows={2} value={p.goals ?? ""} onChange={set("goals")} placeholder="e.g. Half marathon under 1:35 in March; keep 2 gym sessions/week" />
      </label>
      <label className="field">
        <span>Sports</span>
        <input value={p.sports ?? ""} onChange={set("sports")} placeholder="e.g. running, road cycling, strength" />
      </label>
      <label className="field">
        <span>Hours available per week</span>
        <input type="number" inputMode="decimal" min={0} max={40} value={p.weeklyHours ?? ""} onChange={set("weeklyHours")} />
      </label>
      <label className="field">
        <span>Constraints / injuries / schedule</span>
        <textarea rows={2} value={p.constraints ?? ""} onChange={set("constraints")} placeholder="e.g. Achilles niggle; no training Wednesdays; long sessions on weekends" />
      </label>
      <label className="field">
        <span>Preferences</span>
        <textarea rows={2} value={p.preferences ?? ""} onChange={set("preferences")} placeholder="e.g. prefer intervals on the bike, love trail runs" />
      </label>
      <div className="row">
        <button className="btn primary">Save profile</button>
        {saved && <span className="muted small">{saved}</span>}
      </div>
    </form>
  );
}

export function Logout() {
  return (
    <button
      className="btn block"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        location.href = "/login";
      }}
    >
      Sign out
    </button>
  );
}
