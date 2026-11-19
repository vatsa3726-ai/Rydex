"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, mediaUrl, type VeyraModel } from "../lib";
type Message = { id: string; role: "user" | "assistant"; content: string };
export function Chat({ id }: { id: string }) {
  const [model, setModel] = useState<VeyraModel | null>(null),
    [portrait, setPortrait] = useState(""),
    [messages, setMessages] = useState<Message[]>([]),
    [draft, setDraft] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [more, setMore] = useState(false),
    [mode, setMode] = useState("preview"),
    [report, setReport] = useState<Message | null>(null),
    [category, setCategory] = useState("safety"),
    [details, setDetails] = useState(""),
    [share, setShare] = useState(false),
    [reportDone, setReportDone] = useState(false);
  const pending = useRef<{ id: string; text: string } | null>(null),
    end = useRef<HTMLDivElement>(null),
    lock = useRef(false);
  async function history() {
    const d = await api(`conversations/${encodeURIComponent(id)}`);
    setMessages(d.messages);
    setMore(d.hasMore);
    setMode(d.mode);
  }
  useEffect(() => {
    let active = true;
    void Promise.all([
      api(`models/${encodeURIComponent(id)}`),
      api(`conversations/${encodeURIComponent(id)}`),
    ])
      .then(([m, c]) => {
        if (active) {
          setModel(m.model);
          setPortrait(m.media.find((p: any) => p.tier === "free")?.id ?? "");
          setMessages(c.messages);
          setMore(c.hasMore);
          setMode(c.mode);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages.length, busy]);
  async function action(work: () => Promise<void>) {
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
  async function send() {
    if (!draft.trim()) return;
    if (pending.current?.text !== draft.trim())
      pending.current = { id: crypto.randomUUID(), text: draft.trim() };
    await api(`models/${encodeURIComponent(id)}/chat`, "POST", {
      content: pending.current.text,
      requestId: pending.current.id,
    });
    await history();
    pending.current = null;
    setDraft("");
  }
  return (
    <section className="vy-chat-layout">
      <aside className="vy-chat-aside">
        {portrait && (
          <img
            src={mediaUrl(portrait)}
            alt={`Generated fictional adult ${model?.name ?? "AI"} portrait`}
          />
        )}
        <h2>{model?.name ?? "Your companion"}</h2>
        <p className="vy-muted">Fictional AI adult · {model?.age ?? "21+"}</p>
        <p>{model?.tagline}</p>
        <Link href={`/models/${id}`}>Profile & customization</Link>
        <p className="vy-disclosure">
          An AI simulation. Never a human, conscious partner or substitute for
          real-world relationships.
        </p>
        <button
          className="vy-quiet"
          disabled={busy}
          onClick={() => {
            if (
              window.confirm(
                "Permanently delete this conversation and its preferences?",
              )
            )
              void action(async () => {
                await api(
                  `conversations/${encodeURIComponent(id)}`,
                  "DELETE",
                  {},
                );
                setMessages([]);
                setMore(false);
                pending.current = null;
              });
          }}
        >
          Clear conversation
        </button>
        <Link href="/history">All conversations</Link>
      </aside>
      <div className="vy-panel vy-chat">
        <div className="vy-chat-title">
          <div>
            <span className="vy-eyebrow">YOUR PRIVATE CONVERSATION</span>
            <h1>{model?.name ?? "A space to connect."}</h1>
          </div>
          <span className="vy-age-badge">AI</span>
        </div>
        <p className="vy-mode">
          {mode === "preview"
            ? "Sample replies · No live AI model is configured."
            : "AI-generated replies · Recent messages and your preferences go to the configured provider."}
        </p>
        <div
          className="vy-messages"
          role="log"
          aria-live="polite"
          aria-relevant="additions"
        >
          {more && (
            <button
              className="vy-quiet"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  const d = await api(
                    `conversations/${encodeURIComponent(id)}?before=${messages[0].id}`,
                  );
                  setMessages([...d.messages, ...messages]);
                  setMore(d.hasMore);
                })
              }
            >
              Load earlier messages
            </button>
          )}
          {!messages.length && (
            <div className="vy-chat-empty">
              <span className="vy-monogram" aria-hidden="true">
                V
              </span>
              <p>
                Take your time.
                <br />
                What would you like to explore?
              </p>
            </div>
          )}
          {messages.map((m) => (
            <div className={`vy-bubble ${m.role}`} key={m.id}>
              <small>
                {m.role === "user"
                  ? "You"
                  : `${model?.name ?? "Companion"} · AI`}
              </small>
              <p>{m.content}</p>
              {m.role === "assistant" && (
                <button
                  className="vy-report-link"
                  onClick={() => {
                    setReport(m);
                    setReportDone(false);
                    setShare(false);
                    setDetails("");
                  }}
                >
                  Report this reply
                </button>
              )}
            </div>
          ))}
          {busy && (
            <p role="status" className="vy-muted">
              One moment…
            </p>
          )}
          <div ref={end} />
        </div>
        {error && (
          <p className="vy-error" role="alert">
            {error} <Link href="/plans">View access settings</Link>
          </p>
        )}
        <form
          className="vy-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void action(send);
          }}
        >
          <textarea
            aria-label="Your message"
            placeholder="Say what’s on your mind…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={2000}
            rows={2}
            disabled={busy || !model}
          />
          <button
            className="vy-button"
            disabled={busy || !model || !draft.trim()}
          >
            Send
          </button>
        </form>
        <small>
          Private history is saved to your Veyra account. You can export or
          delete it at any time.
        </small>
      </div>
      {report && (
        <section className="vy-panel vy-report-panel" aria-label="Report reply">
          <h2>Request a closer look</h2>
          {reportDone ? (
            <p role="status">Your report was submitted for moderator review.</p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action(async () => {
                  await api("reports", "POST", {
                    modelId: id,
                    messageId: String(report.id),
                    category,
                    details,
                    includeExcerpt: share,
                  });
                  setReportDone(true);
                });
              }}
            >
              <label>
                Reason
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {["safety", "likeness", "privacy", "other"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Your report
                <textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  minLength={5}
                  maxLength={1000}
                  rows={3}
                  required
                />
              </label>
              <label className="vy-check">
                <input
                  type="checkbox"
                  checked={share}
                  onChange={(e) => setShare(e.target.checked)}
                />
                Share up to 500 characters of this reply with moderators.
              </label>
              <p className="vy-muted">
                Without this permission, only your report text is shared. Other
                messages stay private.
              </p>
              <button className="vy-button" disabled={busy}>
                Submit report
              </button>
            </form>
          )}
          <button className="vy-quiet" onClick={() => setReport(null)}>
            Close report form
          </button>
        </section>
      )}
    </section>
  );
}
