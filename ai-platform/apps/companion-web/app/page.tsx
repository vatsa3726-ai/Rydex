"use client";
import { useState, type FormEvent } from "react";
type Message = { role: "user" | "assistant"; content: string };
const roles = ["father", "mother", "sister", "brother", "friend"];
const styles = [
  "Grounded & encouraging",
  "Warm & attentive",
  "Playful & understanding",
  "Easygoing & motivating",
  "Curious & open",
];
export default function Home() {
  const [role, setRole] = useState("friend"),
    [token, setToken] = useState(""),
    [messages, setMessages] = useState<Message[]>([]),
    [draft, setDraft] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [consent, setConsent] = useState(false),
    [note, setNote] = useState(""),
    [memories, setMemories] = useState<{ id: string; text: string }[]>([]);
  async function api(
    path: string,
    method = "GET",
    body?: unknown,
    auth = token,
  ) {
    const r = await fetch(`/api/soulnest/${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await r.json();
    if (!r.ok)
      throw Error(
        r.status === 401
          ? "Session expired. Select Start fresh."
          : (data.error ?? "Please try again."),
      );
    return data;
  }
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
  function start(next: string) {
    action(async () => {
      if (token) {
        try {
          await api("session", "DELETE");
        } catch (e) {
          if (!(e as Error).message.includes("expired")) throw e;
        }
      }
      setToken("");
      setMessages([]);
      setMemories([]);
      setConsent(false);
      setDraft("");
      setNote("");
      const d = await api("sessions", "POST", { role: next }, "");
      setRole(next);
      setToken(d.token);
      setMessages([{ role: "assistant", content: d.opening }]);
    });
  }
  function send(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim() || busy) return;
    action(async () => {
      const pending: Message[] = [
        ...messages,
        { role: "user", content: draft.trim() },
      ];
      const d = await api("chat", "POST", { messages: pending.slice(-39) });
      setMessages([...pending, { role: "assistant", content: d.content }]);
      setDraft("");
    });
  }
  return (
    <main>
      <header>
        <b>SoulNest ✧</b>
        <span>AI companions · Early preview</span>
      </header>
      <section className="intro">
        <small>A LITTLE SPACE TO FEEL HEARD</small>
        <h1>
          Come as you are.
          <br />
          Let’s talk it through.
        </h1>
        <p>
          Choose a familiar conversational style, and take a moment for
          yourself.
        </p>
        <p>
          Every companion is a fictional AI, never a human or your actual
          relative.
        </p>
      </section>
      <div className="workspace">
        <aside>
          <h2>Your kind of company</h2>
          {roles.map((r, i) => (
            <button
              className="role"
              key={r}
              aria-pressed={role === r}
              disabled={busy}
              onClick={() => start(r)}
            >
              <strong>{r}</strong>
              <small>{styles[i]}</small>
            </button>
          ))}
          <p>
            <small>
              Choosing a companion starts fresh and deletes the previous
              session’s saved notes.
            </small>
          </p>
        </aside>
        <section className="chat">
          <div className="chathead">
            <h2>{role} · AI companion</h2>
            <button disabled={busy} onClick={() => start(role)}>
              Start fresh
            </button>
          </div>
          <small>Preview replies · No live AI model connected</small>
          <div
            className="messages"
            role="log"
            aria-live="polite"
            aria-relevant="additions"
          >
            {!token && (
              <p>Choose a companion or select Start fresh to begin.</p>
            )}
            {messages.map((m, i) => (
              <div className={`bubble ${m.role}`} key={i}>
                <small>{m.role === "user" ? "You" : "AI companion"}</small>
                <p>{m.content}</p>
              </div>
            ))}
            {busy && <p role="status">One moment…</p>}
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <form onSubmit={send}>
            <textarea
              aria-label="Your message"
              placeholder="What’s on your mind?"
              maxLength={2000}
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={!token || busy}
            />
            <button
              className="primary"
              disabled={!token || busy || !draft.trim()}
            >
              Send
            </button>
          </form>
          <small>
            Share only what feels comfortable. Messages stay in this page’s
            memory and are sent to the API for replies.
          </small>
        </section>
      </div>
      <section className="memory">
        <h2>Remember only what you choose</h2>
        <p>
          Memory is off by default. Only notes you explicitly save are sent as
          context for future replies in this session. Preview replies do not yet
          personalize from notes.
        </p>
        <label>
          <input
            type="checkbox"
            checked={consent}
            disabled={!token || busy}
            onChange={() =>
              action(async () => {
                await api("consent", "PUT", { enabled: !consent });
                setConsent(!consent);
                setMemories([]);
                setNote("");
              })
            }
          />{" "}
          Allow session memories
        </label>
        <p>
          <small>
            Turning this off deletes all saved notes. Notes expire after one
            hour of inactivity, on Start fresh, or when the API restarts.
            Refreshing this page loses access to the session. No permanent
            storage is connected. Avoid saving sensitive information.
          </small>
        </p>
        {consent && (
          <>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                action(async () => {
                  const d = await api("memories", "POST", {
                    text: note.trim(),
                  });
                  setMemories([...memories, d]);
                  setNote("");
                });
              }}
            >
              <input
                aria-label="Memory to save"
                placeholder="For example: I prefer short replies"
                maxLength={300}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={busy}
              />
              <button className="primary" disabled={busy || !note.trim()}>
                Save this note
              </button>
            </form>
            <ul>
              {memories.map((m) => (
                <li key={m.id}>
                  {m.text}{" "}
                  <button
                    disabled={busy}
                    onClick={() =>
                      action(async () => {
                        await api(`memories/${m.id}`, "DELETE");
                        setMemories(memories.filter((n) => n.id !== m.id));
                      })
                    }
                  >
                    Forget
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <footer>
        All roles are non-sexual and non-romantic. SoulNest supports reflection
        and real-world connections. It does not replace family, friends,
        professional care or emergency services.
      </footer>
    </main>
  );
}
