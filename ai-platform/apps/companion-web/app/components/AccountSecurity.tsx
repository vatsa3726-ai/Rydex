"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { api } from "../SoulNest";
export function AccountSecurity({
  email: initialEmail = "",
  onVerified,
}: {
  email?: string;
  onVerified: () => Promise<void>;
}) {
  const [email, setEmail] = useState(initialEmail),
    [token, setToken] = useState(""),
    [password, setPassword] = useState(""),
    [purpose, setPurpose] = useState<"verify" | "reset">("verify"),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [enabled, setEnabled] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    void api("config")
      .then((c) => setEnabled(c.emailEnabled))
      .catch((e) => setError(e.message));
    const f = new URLSearchParams(location.hash.slice(1));
    if (f.get("purpose") === "reset") setPurpose("reset");
    if (f.get("email")) setEmail(f.get("email")!);
    if (f.get("token")) setToken(f.get("token")!);
    if (location.hash) history.replaceState(null, "", location.pathname);
  }, []);
  useEffect(() => {
    if (initialEmail) setEmail(initialEmail);
  }, [initialEmail]);
  async function run(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="panel auth">
      <span className="eyebrow">ACCOUNT SECURITY</span>
      <h1>Your account, protected.</h1>
      <p>
        {purpose === "verify"
          ? "Verify your email before using companions in production."
          : "Recover your account with a one-time email token."}
      </p>
      <button
        onClick={() => {
          setPurpose(purpose === "verify" ? "reset" : "verify");
          setToken("");
          setPassword("");
          setNotice("");
          setError("");
        }}
        disabled={busy}
      >
        {purpose === "verify"
          ? "I need to reset my password"
          : "I need to verify my email"}
      </button>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const r = await api(
              `auth/${purpose === "verify" ? "request-verification" : "forgot-password"}`,
              "POST",
              { email },
            );
            setNotice(r.notice);
          });
        }}
      >
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={254}
            required
            autoComplete="email"
          />
        </label>
        <button disabled={busy || !enabled}>
          Send {purpose === "verify" ? "verification" : "recovery"} email
        </button>
      </form>
      {!enabled && (
        <p className="notice">
          Account email delivery has not been connected in this preview. Your
          existing password still works.
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await api(
              `auth/${purpose === "verify" ? "verify-email" : "reset-password"}`,
              "POST",
              {
                email,
                token: token.trim(),
                ...(purpose === "reset" ? { password } : {}),
              },
            );
            setToken("");
            setPassword("");
            setNotice(
              purpose === "verify"
                ? "Email verified. You can continue to your companions."
                : "Password reset. Sign in again on each device.",
            );
            await onVerified();
          });
        }}
      >
        <label>
          One-time token from your email
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            maxLength={64}
            minLength={64}
            autoComplete="off"
            required
          />
        </label>
        {purpose === "reset" && (
          <label>
            New password · at least 12 characters
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              required
            />
          </label>
        )}
        <button className="primary" disabled={busy || token.length !== 64}>
          {purpose === "verify"
            ? "Verify email"
            : "Reset password and sign out all devices"}
        </button>
      </form>
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="actions">
        <Link href="/dashboard">My companions</Link>
        <Link href="/settings">Account & privacy</Link>
        <Link href="/login">Sign in</Link>
      </div>
    </section>
  );
}
export function PasswordTools({ onSignedOut }: { onSignedOut: () => void }) {
  const [current, setCurrent] = useState(""),
    [next, setNext] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function run(all: boolean) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (all) await api("auth/logout-all", "POST", { password: current });
      else
        await api("account/password", "PUT", {
          currentPassword: current,
          newPassword: next,
        });
      setCurrent("");
      setNext("");
      onSignedOut();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section>
      <h2>Account security</h2>
      <Link href="/account-security">Email verification & recovery</Link>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(false);
        }}
      >
        <label>
          Current password
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            maxLength={128}
            autoComplete="current-password"
            required
          />
        </label>
        <label>
          New password · at least 12 characters
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            required
          />
        </label>
        <button disabled={busy}>Change password & sign out all devices</button>
      </form>
      <button
        disabled={busy || !current}
        onClick={() => {
          if (
            confirm(
              "Sign out every SoulNest device? Your password stays the same.",
            )
          )
            void run(true);
        }}
      >
        Sign out every device
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
