"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ReportReply } from "./ReportReply";
import { Voice } from "./Voice";
import { CompanionTools } from "./CompanionTools";
import { api, type Companion } from "../SoulNest";
type Message = { id: string; role: "user" | "assistant"; content: string };
export function Chat({ companion }: { companion?: Companion }) {
  const [messages, setMessages] = useState<Message[]>([]),
    [draft, setDraft] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [more, setMore] = useState(false),
    [mode, setMode] = useState("preview"),
    [report, setReport] = useState<string | null>(null);
  const [hasPhoto, setHasPhoto] = useState(companion?.has_photo ?? false),
    [photoVersion, setPhotoVersion] = useState(0);
  const request = useRef<{ id: string; text: string } | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    if (companion)
      api(`companions/${companion.id}/messages`)
        .then((d) => {
          if (active) {
            setMessages(d.messages);
            setMore(d.hasMore);
            setMode(d.mode);
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [companion?.id]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages.length]);
  if (!companion)
    return (
      <section className="panel empty">
        <h2>Companion not found.</h2>
        <Link href="/dashboard">Back to my space</Link>
      </section>
    );
  const c = companion;
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function send(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim() || busy) return;
    action(async () => {
      if (request.current?.text !== draft.trim())
        request.current = { id: crypto.randomUUID(), text: draft.trim() };
      const pending = request.current!;
      const d = await api(`companions/${c.id}/chat`, "POST", {
        content: pending.text,
        requestId: pending.id,
      });
      const recent = await api(`companions/${c.id}/messages`);
      setMessages(recent.messages);
      setMore(recent.hasMore);
      setDraft("");
      request.current = null;
      setMode(d.mode ?? mode);
    });
  }
  return (
    <div className="chat-layout">
      <section className="panel chat-panel">
        <div className="chat-head">
          <div className="avatar">
            {hasPhoto ? (
              <img
                src={`/api/soulnest/companions/${c.id}/photo?v=${photoVersion}`}
                alt="Authorized AI avatar"
              />
            ) : (
              c.name[0]
            )}
          </div>
          <div>
            <h2>{c.name}</h2>
            <small>
              Fictional AI · {c.relationship} style · {c.language.toUpperCase()}
            </small>
          </div>
        </div>
        <p className="notice">
          {mode === "preview"
            ? "Preview replies: no live AI is configured. Sample responses demonstrate the flow."
            : "AI-generated replies. Your messages and enabled memory notes are sent to the configured provider."}
        </p>
        <div
          className="messages"
          role="log"
          aria-live="polite"
          aria-relevant="additions"
        >
          {more && (
            <button
              disabled={busy}
              onClick={() =>
                action(async () => {
                  const d = await api(
                    `companions/${c.id}/messages?before=${messages[0].id}`,
                  );
                  setMessages([...d.messages, ...messages]);
                  setMore(d.hasMore);
                })
              }
            >
              Load earlier messages
            </button>
          )}
          {messages.length === 0 && (
            <p>Take your time. What would you like to talk about?</p>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`bubble ${m.role}`}>
              <small>{m.role === "user" ? "You" : `${c.name} · AI`}</small>
              <p>{m.content}</p>
              {m.role === "assistant" && (
                <button disabled={busy} onClick={() => setReport(String(m.id))}>
                  Report reply
                </button>
              )}
            </div>
          ))}
          {busy && <p role="status">One moment…</p>}
          <div ref={end} />
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <form className="composer" onSubmit={send}>
          <textarea
            aria-label="Your message"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="What’s on your mind?"
            disabled={busy}
          />
          <button className="primary" disabled={busy || !draft.trim()}>
            Send ↗
          </button>
        </form>
        <small>
          History is saved privately to your account. You can clear it at any
          time.
        </small>
      </section>
      <aside className="panel tools">
        <h2>Your conversation</h2>
        <p>
          A familiar tone, with honest boundaries. Your companion is an AI
          simulation.
        </p>
        <Link href={`/edit/${c.id}`}>Customize companion →</Link>
        <section>
          <h2>Start a new chapter</h2>
          <p>
            Clear the saved conversation. This removes chat messages but does
            not delete separately saved memories.
          </p>
          <button
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  "Permanently clear this companion’s conversation history?",
                )
              )
                action(async () => {
                  await api(`companions/${c.id}/messages`, "DELETE", {});
                  setMessages([]);
                  setMore(false);
                  request.current = null;
                });
            }}
          >
            Clear conversation
          </button>
        </section>
        {report && (
          <ReportReply
            key={report}
            companionId={c.id}
            messageId={report}
            onClose={() => setReport(null)}
          />
        )}
        <Voice
          companionId={c.id}
          lastMessageId={
            [...messages].reverse().find((m) => m.role === "assistant")?.id
          }
          onText={(text) =>
            setDraft((previous) => (previous ? `${previous}\n${text}` : text))
          }
          disabled={busy}
        />
        <CompanionTools
          companion={c}
          disabled={busy}
          onPhoto={(saved) => {
            setHasPhoto(saved);
            setPhotoVersion((v) => v + 1);
          }}
        />
      </aside>
    </div>
  );
}
