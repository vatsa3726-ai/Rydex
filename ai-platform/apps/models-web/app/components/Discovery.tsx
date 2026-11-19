"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, mediaUrl, type VeyraModel, type Customization } from "../lib";
export function Discovery() {
  const [models, setModels] = useState<VeyraModel[]>([]),
    [search, setSearch] = useState(""),
    [style, setStyle] = useState("all"),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    void api("models")
      .then((d) => setModels(d.models))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  const visible = models.filter(
    (m) =>
      (style === "all" || m.personality === style) &&
      `${m.name} ${m.interests}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <section className="vy-page">
      <div className="vy-page-heading">
        <span className="vy-eyebrow">THE COLLECTION</span>
        <h1>Who captures your curiosity?</h1>
        <p>
          Distinctive personalities. Entirely fictional adults, aged 21+. Every
          connection is an AI simulation.
        </p>
      </div>
      <div className="vy-filters">
        <label>
          Find a personality
          <input
            type="search"
            placeholder="A name, an interest, a mood…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          Conversational style
          <select value={style} onChange={(e) => setStyle(e.target.value)}>
            <option value="all">Every style</option>
            {["warm", "witty", "reflective", "adventurous"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p className="vy-error" role="alert">
          {error}
        </p>
      )}
      {loading && <p role="status">Opening the collection…</p>}
      <div className="vy-model-grid">
        {visible.map((m) => (
          <article className="vy-model-card" key={m.id}>
            <Link className="vy-model-image" href={`/models/${m.id}`}>
              {m.portrait_id ? (
                <img
                  src={mediaUrl(m.portrait_id)}
                  alt={`Generated portrait of ${m.name}, fictional AI adult age ${m.age}`}
                  loading="lazy"
                />
              ) : (
                <div className="vy-no-portrait">V</div>
              )}
              <span className="vy-image-tag">FICTIONAL AI · {m.age}</span>
              {m.tier === "premium" && (
                <span className="vy-tier-tag">PRIVATE CIRCLE</span>
              )}
            </Link>
            <div className="vy-card-copy">
              <div>
                <h2>
                  <Link href={`/models/${m.id}`}>{m.name}</Link>
                </h2>
                <small>{m.personality}</small>
              </div>
              <p>{m.tagline}</p>
              <p className="vy-muted">{m.interests}</p>
              <Link className="vy-link" href={`/models/${m.id}`}>
                Meet {m.name.split(" ")[0]}
              </Link>
            </div>
          </article>
        ))}
      </div>
      {!loading && !visible.length && (
        <p>
          No personalities match this search. Try another interest or style.
        </p>
      )}
    </section>
  );
}
export function ModelProfile({
  id,
  premium,
  galleryOnly = false,
}: {
  id: string;
  premium: boolean;
  galleryOnly?: boolean;
}) {
  const [model, setModel] = useState<VeyraModel | null>(null),
    [media, setMedia] = useState<
      { id: string; tier: string; source: string }[]
    >([]),
    [custom, setCustom] = useState<Customization>({
      tone: "warm",
      language: "en",
      preferences: "",
    }),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false),
    [reason, setReason] = useState(""),
    [reportDone, setReportDone] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    void Promise.all([
      api(`models/${encodeURIComponent(id)}`),
      api(`conversations/${encodeURIComponent(id)}`),
    ])
      .then(([data, history]) => {
        if (active) {
          setModel(data.model);
          setMedia(data.media);
          setCustom({ ...custom, ...history.customization });
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id]);
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
  if (!model)
    return (
      <section className="vy-page">
        {error ? (
          <p className="vy-error" role="alert">
            {error}
          </p>
        ) : (
          <p role="status">Preparing your introduction…</p>
        )}
      </section>
    );
  const portrait = media.find((m) => m.tier === "free");
  return (
    <section className="vy-page">
      {!galleryOnly && (
        <div className="vy-profile">
          <div className="vy-profile-portrait">
            {portrait ? (
              <img
                src={mediaUrl(portrait.id)}
                alt={`AI-generated fictional ${model.name}, age ${model.age}`}
              />
            ) : (
              <div className="vy-no-portrait">V</div>
            )}
            <span className="vy-image-tag">FICTIONAL AI · {model.age}</span>
          </div>
          <div className="vy-profile-copy">
            <span className="vy-eyebrow">
              {model.tier === "premium"
                ? "PRIVATE CIRCLE"
                : "THE VEYRA COLLECTION"}
            </span>
            <h1>{model.name}</h1>
            <h2>{model.tagline}</h2>
            <p>{model.bio}</p>
            <p className="vy-muted">
              {model.interests} · {model.personality}
            </p>
            <p className="vy-disclosure">
              {model.name} is a fictional AI adult aged {model.age}. The
              portrait is generated. You are never speaking to a real person.
            </p>
            <Link
              className="vy-button"
              href={
                model.tier === "premium" && !premium
                  ? "/plans"
                  : `/chat/${model.id}`
              }
            >
              {model.tier === "premium" && !premium
                ? "Explore Private Circle"
                : "Begin a conversation"}
            </Link>
          </div>
        </div>
      )}
      <div className="vy-section-heading">
        <div>
          <span className="vy-eyebrow">THE EDITORIAL GALLERY</span>
          <h2>{model.name}, imagined.</h2>
        </div>
        {!galleryOnly && (
          <Link href={`/gallery/${model.id}`}>Open gallery</Link>
        )}
      </div>
      <div className="vy-gallery">
        {media.map((item) => (
          <figure key={item.id}>
            {item.tier === "premium" && !premium ? (
              <div className="vy-locked-media">
                <span>PRIVATE CIRCLE</span>
                <p>Premium gallery access</p>
                <Link href="/plans">View membership</Link>
              </div>
            ) : (
              <img
                src={mediaUrl(item.id)}
                alt={`Reviewed ${item.source} non-explicit portrait of fictional adult ${model.name}`}
                loading="lazy"
              />
            )}
            <figcaption>
              {item.source === "generated"
                ? "AI-generated editorial"
                : "Authorized licensed editorial"}{" "}
              · Fictional adult ·{" "}
              {item.tier === "premium" ? "Private Circle" : "Discovery"}
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="vy-profile-panels">
        <section className="vy-panel">
          <span className="vy-eyebrow">SHAPED AROUND YOUR CONVERSATION</span>
          <h2>Make the tone your own.</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action(async () => {
                await api(
                  `conversations/${model.id}/customization`,
                  "PUT",
                  custom,
                );
                setSaved(true);
              });
            }}
          >
            <div className="vy-form-grid">
              <label>
                Tone
                <select
                  value={custom.tone}
                  onChange={(e) => {
                    setCustom({ ...custom, tone: e.target.value });
                    setSaved(false);
                  }}
                >
                  {["warm", "witty", "reflective", "direct"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label>
                Language
                <select
                  value={custom.language}
                  onChange={(e) => {
                    setCustom({ ...custom, language: e.target.value });
                    setSaved(false);
                  }}
                >
                  <option value="en">English</option>
                  <option value="hi">हिन्दी · Hindi</option>
                  <option value="kn">ಕನ್ನಡ · Kannada</option>
                </select>
              </label>
            </div>
            <label>
              Conversational preferences
              <textarea
                value={custom.preferences}
                onChange={(e) => {
                  setCustom({ ...custom, preferences: e.target.value });
                  setSaved(false);
                }}
                maxLength={500}
                rows={3}
                placeholder="Short replies, thoughtful questions, shared interests…"
              />
            </label>
            <button className="vy-button vy-outline" disabled={busy}>
              Save my preferences
            </button>
            {saved && <p role="status">Your private preferences are saved.</p>}
          </form>
          <small>
            These preferences apply only to your conversations. They cannot
            change the character’s adult identity, AI disclosure or safety
            boundaries.
          </small>
        </section>
        <section className="vy-panel">
          <span className="vy-eyebrow">RESPECT IS PART OF THE EXPERIENCE</span>
          <h2>Something needs a closer look?</h2>
          {reportDone ? (
            <p role="status">
              Your report has been submitted for moderator review.
            </p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action(async () => {
                  await api("reports", "POST", {
                    modelId: model.id,
                    category: "likeness",
                    details: reason,
                    includeExcerpt: false,
                  });
                  setReportDone(true);
                  setReason("");
                });
              }}
            >
              <label>
                Describe a profile, likeness or media concern
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  minLength={5}
                  maxLength={1000}
                  rows={4}
                  required
                />
              </label>
              <button className="vy-button vy-outline" disabled={busy}>
                Submit profile report
              </button>
            </form>
          )}
          <small>
            This form shares only your report text. It does not share your
            private conversation.
          </small>
        </section>
      </div>
      {error && (
        <p className="vy-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
