"use client";
import { useState, useRef } from "react";
import { api } from "../SoulNest";
export function ReportReply({
  companionId,
  messageId,
  onClose,
}: {
  companionId: string;
  messageId: string;
  onClose: () => void;
}) {
  const [details, setDetails] = useState(""),
    [share, setShare] = useState(false),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  return (
    <section className="panel" aria-label="Report AI reply">
      <h2>Report this AI reply</h2>
      {done ? (
        <p role="status">
          Your report is saved for review. This is not an emergency service.
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (lock.current) return;
            lock.current = true;
            setBusy(true);
            setError("");
            void api("reports", "POST", {
              companionId,
              messageId,
              category: "safety",
              details,
              includeExcerpt: share,
            })
              .then(() => {
                setDone(true);
                setDetails("");
              })
              .catch((e) => setError(e.message))
              .finally(() => {
                setBusy(false);
                lock.current = false;
              });
          }}
        >
          <label>
            What should be reviewed?
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              minLength={5}
              maxLength={1000}
              required
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={share}
              onChange={(e) => setShare(e.target.checked)}
            />
            Share up to 500 characters of this reply with the reviewer. Other
            conversations are not included.
          </label>
          <button disabled={busy}>Send report</button>
        </form>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button onClick={onClose}>Close report</button>
    </section>
  );
}
