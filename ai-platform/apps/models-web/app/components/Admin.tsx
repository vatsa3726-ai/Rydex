"use client";
import { useEffect, useRef, useState } from "react";
import { api, mediaUrl, type VeyraModel } from "../lib";
const emptyModel = {
  name: "",
  age: 29,
  fictional: true as const,
  tagline: "",
  bio: "",
  personality: "warm",
  interests: "",
  tier: "free",
  published: false,
};
export function Admin() {
  const [tab, setTab] = useState("overview"),
    [data, setData] = useState<Record<string, any>>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState("new"),
    [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const lock = useRef(false);
  async function load() {
    const [overview, models, media, reports, users, audit] = await Promise.all(
      ["overview", "models", "media", "reports", "users", "audit"].map((key) =>
        api(`admin/${key}`),
      ),
    );
    setData({
      overview,
      models: models.models,
      media: media.media,
      reports: reports.reports,
      users: users.users,
      audit: audit.events,
    });
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  async function action(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="vy-page vy-admin">
      <div className="vy-page-heading">
        <span className="vy-eyebrow">VEYRA STUDIO · AUTHORIZED OPERATORS</span>
        <h1>Considered, at every level.</h1>
        <p>
          Manage fictional adult profiles, reviewed media and access. Analytics
          are aggregate; private transcripts are not exposed.
        </p>
      </div>
      <div
        className="vy-admin-tabs"
        role="tablist"
        aria-label="Studio sections"
      >
        {["overview", "models", "media", "reports", "users", "audit"].map(
          (t) => (
            <button
              role="tab"
              aria-selected={tab === t}
              key={t}
              onClick={() => {
                setTab(t);
                setError("");
              }}
              className={tab === t ? "active" : ""}
            >
              {t}
            </button>
          ),
        )}
      </div>
      {error && (
        <p className="vy-error" role="alert">
          {error}
        </p>
      )}
      {busy && (
        <p role="status" className="vy-muted">
          Saving changes…
        </p>
      )}
      {tab === "overview" && (
        <>
          <div className="vy-metrics">
            {[
              ["users", "Accounts"],
              ["verifiedUsers", "Current age access"],
              ["publishedModels", "Published profiles"],
              ["messages", "Saved messages"],
              ["openReports", "Open reports"],
              ["pendingMedia", "Media awaiting review"],
            ].map(([key, label]) => (
              <article className="vy-panel" key={key}>
                <span>{label}</span>
                <strong>{data.overview?.[key] ?? "—"}</strong>
              </article>
            ))}
          </div>
          <p className="vy-disclosure">
            Payments are disabled. No revenue or billing data is collected.
            Operator access does not grant a route to browse users’ private
            conversations.
          </p>
        </>
      )}
      {tab === "models" && (
        <div className="vy-admin-columns">
          <section className="vy-panel">
            <h2>Character collection</h2>
            <button
              className="vy-button vy-outline"
              onClick={() => setSelected("new")}
            >
              Create a fictional character
            </button>
            {data.models?.map((m: VeyraModel) => (
              <button
                className="vy-admin-list-item"
                onClick={() => setSelected(m.id)}
                key={m.id}
              >
                <strong>{m.name}</strong>
                <span>
                  Fictional · {m.age} · {m.published ? "Published" : "Draft"} ·{" "}
                  {m.tier}
                </span>
              </button>
            ))}
          </section>
          <ModelForm
            key={selected}
            model={data.models?.find((m: VeyraModel) => m.id === selected)}
            busy={busy}
            save={(body) =>
              void action(async () => {
                const result = await api(
                  selected === "new"
                    ? "admin/models"
                    : `admin/models/${selected}`,
                  selected === "new" ? "POST" : "PUT",
                  body,
                );
                if (result.id) setSelected(result.id);
              })
            }
          />
        </div>
      )}
      {tab === "media" && (
        <>
          <section className="vy-panel vy-reading">
            <h2>Add an authorized editorial</h2>
            <p>
              Uploads start pending. Publication needs a separate adult, rights
              and non-explicit review. Use generated or licensed media; do not
              upload an unauthorized real-person likeness.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget),
                  file = f.get("image") as File;
                void action(async () => {
                  if (!file || file.size > 2 * 1024 * 1024)
                    throw Error("Select a JPG, PNG or WebP under 2 MB.");
                  const base64 = await new Promise<string>(
                    (resolve, reject) => {
                      const reader = new FileReader();
                      reader.onload = () =>
                        resolve(String(reader.result).split(",")[1]);
                      reader.onerror = () =>
                        reject(Error("Could not read image."));
                      reader.readAsDataURL(file);
                    },
                  );
                  await api("admin/media", "POST", {
                    modelId: f.get("modelId"),
                    source: f.get("source"),
                    tier: f.get("tier"),
                    base64,
                    rightsConfirmed: true,
                    fictionalAdultConfirmed: true,
                    nonExplicitConfirmed: true,
                  });
                });
              }}
            >
              <div className="vy-form-grid">
                <label>
                  Character
                  <select name="modelId" required>
                    {data.models?.map((m: VeyraModel) => (
                      <option key={m.id} value={m.id}>
                        {m.name} · {m.age}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Source
                  <select name="source">
                    <option value="generated">Generated</option>
                    <option value="licensed">Licensed / authorized</option>
                  </select>
                </label>
                <label>
                  Access tier
                  <select name="tier">
                    <option value="free">Discovery</option>
                    <option value="premium">Private Circle</option>
                  </select>
                </label>
                <label>
                  Editorial image
                  <input
                    name="image"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    required
                  />
                </label>
              </div>
              <label className="vy-check">
                <input type="checkbox" required />I have the rights to publish
                this non-explicit image, and confirm it depicts an authorized
                fictional adult 21+.
              </label>
              <button className="vy-button" disabled={busy}>
                Upload for review
              </button>
            </form>
          </section>
          <section className="vy-panel">
            <h2>Review queue & gallery assets</h2>
            <label>
              Review reason
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                minLength={5}
                maxLength={500}
                rows={2}
                placeholder="Describe the review outcome without sensitive personal information."
              />
            </label>
            <label className="vy-check">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              For approval, I have checked rights, fictional adult identity and
              non-explicit content.
            </label>
            <div className="vy-admin-media">
              {data.media?.map((m: any) => (
                <article key={m.id}>
                  <img
                    src={mediaUrl(m.id)}
                    alt={`Private moderation preview for ${m.name}`}
                  />
                  <p>
                    {m.name} · {m.source} · {m.tier}
                  </p>
                  <p className="vy-muted">{m.status}</p>
                  <div className="vy-actions">
                    <button
                      className="vy-quiet"
                      disabled={busy || reason.trim().length < 5 || !confirmed}
                      onClick={() =>
                        void action(async () => {
                          await api(`admin/media/${m.id}/review`, "POST", {
                            decision: "approved",
                            reason,
                            rightsConfirmed: confirmed,
                            fictionalAdultConfirmed: confirmed,
                            nonExplicitConfirmed: confirmed,
                          });
                        })
                      }
                    >
                      Approve
                    </button>
                    <button
                      className="vy-quiet"
                      disabled={busy || reason.trim().length < 5}
                      onClick={() =>
                        void action(async () => {
                          await api(`admin/media/${m.id}/review`, "POST", {
                            decision: "rejected",
                            reason,
                            rightsConfirmed: confirmed,
                            fictionalAdultConfirmed: confirmed,
                            nonExplicitConfirmed: confirmed,
                          });
                        })
                      }
                    >
                      Reject
                    </button>
                    <button
                      className="vy-quiet vy-danger-text"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Remove this gallery asset and queue its stored object for deletion?",
                          )
                        )
                          void action(async () => {
                            await api(`admin/media/${m.id}`, "DELETE", {});
                          });
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
      {tab === "reports" && (
        <section className="vy-panel">
          <h2>Moderation reports</h2>
          <label>
            Resolution note
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={5}
              maxLength={500}
              rows={2}
            />
          </label>
          <div className="vy-admin-report-list">
            {data.reports?.map((r: any) => (
              <article className="vy-panel" key={r.id}>
                <p>
                  <strong>{r.category}</strong> · {r.status} ·{" "}
                  {r.model_id ?? "Removed model"}
                </p>
                <p>{r.details}</p>
                {r.excerpt ? (
                  <blockquote>
                    <small>User-authorized message excerpt</small>
                    <p>{r.excerpt}</p>
                  </blockquote>
                ) : (
                  <p className="vy-muted">
                    No private message excerpt was shared.
                  </p>
                )}
                <div className="vy-actions">
                  {["resolved", "dismissed", "open"].map((status) => (
                    <button
                      className="vy-quiet"
                      disabled={busy || reason.trim().length < 5}
                      key={status}
                      onClick={() =>
                        void action(async () => {
                          await api(`admin/reports/${r.id}`, "PUT", {
                            status,
                            resolution: reason,
                          });
                        })
                      }
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </article>
            ))}
            {data.reports?.length === 0 && <p>No reports are waiting.</p>}
          </div>
        </section>
      )}
      {tab === "users" && (
        <section className="vy-panel">
          <h2>Access management</h2>
          <p>
            Manual evaluation access is time-limited and never collects payment.
            No self-service upgrade endpoint is exposed.
          </p>
          <label>
            Reason for access change
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={5}
              maxLength={200}
              placeholder="Keep notes free of sensitive personal data."
            />
          </label>
          <div className="vy-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Role / plan</th>
                  <th>Restricted access</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.users?.map((u: any) => (
                  <tr key={u.id}>
                    <td>
                      {u.name}
                      <br />
                      <span className="vy-muted">{u.email}</span>
                    </td>
                    <td>
                      {u.role} · {u.plan}
                      <br />
                      <small>
                        {u.active_until
                          ? new Date(u.active_until).toLocaleDateString()
                          : "No premium expiry"}
                      </small>
                    </td>
                    <td>
                      {u.access_blocked
                        ? "Suspended"
                        : "Active when age-current"}
                    </td>
                    <td>
                      <div className="vy-actions">
                        <button
                          className="vy-quiet"
                          disabled={busy || reason.trim().length < 5}
                          onClick={() =>
                            void action(async () => {
                              await api(
                                `admin/users/${u.id}/entitlement`,
                                "PUT",
                                {
                                  plan:
                                    u.plan === "premium" ? "free" : "premium",
                                  days: 30,
                                  reason,
                                },
                              );
                            })
                          }
                        >
                          {u.plan === "premium"
                            ? "Remove premium"
                            : "Grant 30-day evaluation"}
                        </button>
                        {u.role !== "admin" && (
                          <button
                            className="vy-quiet"
                            disabled={busy || reason.trim().length < 5}
                            onClick={() =>
                              void action(async () => {
                                await api(`admin/users/${u.id}/access`, "PUT", {
                                  blocked: !u.access_blocked,
                                  reason,
                                });
                              })
                            }
                          >
                            {u.access_blocked
                              ? "Restore access"
                              : "Suspend access"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {tab === "audit" && (
        <section className="vy-panel">
          <h2>Operator audit trail</h2>
          <div className="vy-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th>Target reference</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {data.audit?.map((a: any) => (
                  <tr key={a.id}>
                    <td>{new Date(a.created_at).toLocaleString()}</td>
                    <td>{a.action}</td>
                    <td className="vy-reference">{a.target_id}</td>
                    <td>{a.reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  );
}
function ModelForm({
  model,
  busy,
  save,
}: {
  model?: VeyraModel;
  busy: boolean;
  save: (body: typeof emptyModel) => void;
}) {
  const [form, setForm] = useState({
    ...emptyModel,
    ...(model
      ? Object.fromEntries(
          Object.keys(emptyModel).map((k) => [k, (model as any)[k]]),
        )
      : {}),
  });
  useEffect(() => {
    if (model)
      setForm({
        ...emptyModel,
        ...Object.fromEntries(
          Object.keys(emptyModel).map((k) => [k, (model as any)[k]]),
        ),
      });
  }, [model]);
  return (
    <section className="vy-panel">
      <h2>{model ? "Edit character" : "Create fictional character"}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(form);
        }}
      >
        <div className="vy-form-grid">
          <label>
            Name
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              minLength={2}
              maxLength={60}
              required
            />
          </label>
          <label>
            Fictional adult age · 21 minimum
            <input
              type="number"
              min={21}
              max={90}
              value={form.age}
              onChange={(e) =>
                setForm({ ...form, age: Number(e.target.value) })
              }
              required
            />
          </label>
        </div>
        <label>
          Tagline
          <input
            value={form.tagline}
            onChange={(e) => setForm({ ...form, tagline: e.target.value })}
            minLength={5}
            maxLength={160}
            required
          />
        </label>
        <label>
          Biography
          <textarea
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
            minLength={10}
            maxLength={1200}
            rows={4}
            required
          />
        </label>
        <label>
          Interests
          <input
            value={form.interests}
            onChange={(e) => setForm({ ...form, interests: e.target.value })}
            maxLength={400}
          />
        </label>
        <div className="vy-form-grid">
          <label>
            Personality
            <select
              value={form.personality}
              onChange={(e) =>
                setForm({ ...form, personality: e.target.value })
              }
            >
              {["warm", "witty", "reflective", "adventurous"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            Access tier
            <select
              value={form.tier}
              onChange={(e) => setForm({ ...form, tier: e.target.value })}
            >
              <option value="free">Discovery</option>
              <option value="premium">Private Circle</option>
            </select>
          </label>
        </div>
        <label className="vy-check">
          <input type="checkbox" checked disabled />
          This character is entirely fictional and aged 21+.
        </label>
        <label className="vy-check">
          <input
            type="checkbox"
            checked={form.published}
            onChange={(e) => setForm({ ...form, published: e.target.checked })}
          />
          Publish this profile
        </label>
        <button className="vy-button" disabled={busy}>
          Save character
        </button>
      </form>
    </section>
  );
}
