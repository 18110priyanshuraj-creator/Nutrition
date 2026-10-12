"use client";
import { useState } from "react";
import { Leaf, LoaderCircle, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to sign in.");
      window.location.href = "/";
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sign in.");
    } finally { setBusy(false); }
  }
  return <main className="login-shell">
    <section className="login-card">
      <div className="brand-mark"><Leaf size={24}/></div>
      <div className="eyebrow">YOUR PERSONAL WELLNESS SPACE</div>
      <h1>MyNutri <span>AI</span></h1>
      <p className="login-copy">A calmer, clearer way to understand your everyday nutrition.</p>
      <form onSubmit={submit} className="login-form">
        <label htmlFor="password">App password</label>
        <input id="password" type="password" autoComplete="current-password" maxLength={512}
          required value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your app password"/>
        <button className="primary-button full-button" disabled={busy}>
          {busy ? <LoaderCircle className="spin" size={18}/> : <ShieldCheck size={18}/>} Sign in securely
        </button>
        {error ? <div className="notice error-notice" role="alert">{error}</div> : null}
      </form>
      <div className="privacy-note"><ShieldCheck size={16}/> Personal logs are protected behind your session.</div>
      <p className="login-setup">First run? Configure APP_PASSWORD and SESSION_SECRET in your server-side environment. This app uses a single owner login.</p>
    </section>
  </main>;
}