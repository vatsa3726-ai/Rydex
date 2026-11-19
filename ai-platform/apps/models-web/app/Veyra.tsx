"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  api,
  mediaUrl,
  type VeyraConfig,
  type VeyraUser,
  type VeyraModel,
} from "./lib";
import { Discovery, ModelProfile } from "./components/Discovery";
import { Chat } from "./components/Chat";
import { Admin } from "./components/Admin";
export default function Veyra() {
  const path = usePathname(),
    router = useRouter();
  const [user, setUser] = useState<VeyraUser | null>(null),
    [verified, setVerified] = useState(false),
    [premium, setPremium] = useState(false),
    [config, setConfig] = useState<VeyraConfig | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [hero, setHero] = useState<string | null>(null);
  const lock = useRef(false);
  async function refresh() {
    try {
      const data = await api("account");
      setUser(data.user);
      setVerified(data.verified);
      setPremium(data.premium);
    } catch {
      setUser(null);
      setVerified(false);
      setPremium(false);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void api<VeyraConfig>("config")
      .then(setConfig)
      .catch((e) => setError(e.message));
    void refresh();
    const expired = () => {
      setUser(null);
      setVerified(false);
      setPremium(false);
    };
    const age = () => {
      setVerified(false);
    };
    window.addEventListener("veyra:expired", expired);
    window.addEventListener("veyra:age-required", age);
    return () => {
      window.removeEventListener("veyra:expired", expired);
      window.removeEventListener("veyra:age-required", age);
    };
  }, []);
  useEffect(() => {
    setError("");
  }, [path]);
  useEffect(() => {
    let active = true;
    if (verified)
      api<{ models: VeyraModel[] }>("models")
        .then((data) => {
          if (active) setHero(data.models[0]?.portrait_id ?? null);
        })
        .catch(() => {});
    else setHero(null);
    return () => {
      active = false;
    };
  }, [verified]);
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
  const auth = path === "/login" || path === "/signup",
    signup = path === "/signup",
    id = path.split("/")[2] ?? "";
  const gate = (
    <section className="vy-panel vy-empty">
      <span className="vy-eyebrow">A PRIVATE WORLD, FOR ADULTS</span>
      <h1>{user ? "A little assurance." : "Your invitation begins here."}</h1>
      <p>
        {user
          ? "Complete your age check to discover our fictional 21+ AI personalities."
          : "Sign in to your Veyra account. Independent age verification is required for production access."}
      </p>
      <Link className="vy-button" href={user ? "/verify" : "/login"}>
        {user ? "Continue age check" : "Sign in"}
      </Link>
      <p className="vy-muted">
        All characters are fictional adults. Veyra is an AI simulation, never a
        real person.
      </p>
    </section>
  );
  return (
    <main className="vy-shell">
      <header className="vy-header">
        <Link className="vy-logo" href="/">
          VEYRA<span>AI</span>
        </Link>
        <nav aria-label="Main navigation">
          <Link href="/discover">Discover</Link>
          <Link href="/plans">Membership</Link>
          {user && (
            <>
              <Link href="/history">Conversations</Link>
              <Link href="/account">My account</Link>
              {user.role === "admin" && <Link href="/admin">Studio</Link>}
            </>
          )}
          <span className="vy-age-badge">18+</span>
          {user ? (
            <button
              className="vy-quiet"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  await api("auth/logout", "POST", {});
                  setUser(null);
                  setVerified(false);
                  setPremium(false);
                  router.push("/");
                })
              }
            >
              Sign out
            </button>
          ) : (
            <Link className="vy-button vy-small" href="/login">
              Enter Veyra
            </Link>
          )}
        </nav>
      </header>
      {config?.ageMode === "development-attestation" && (
        <div className="vy-preview-banner">
          PRIVATE DEVELOPMENT PREVIEW · Age access uses self-attestation here.
          Production requires independent verification.
        </div>
      )}
      {error && (
        <p className="vy-error" role="alert">
          {error}
        </p>
      )}
      {path === "/" ? (
        <>
          <section className="vy-hero">
            <div className="vy-hero-copy">
              <span className="vy-eyebrow">
                FICTIONAL BY DESIGN. PERSONAL BY CHOICE.
              </span>
              <h1>
                Presence,
                <br />
                <em>reimagined.</em>
              </h1>
              <p>
                A private world of distinctive AI personalities. Thoughtful
                conversation. A connection shaped around you.
              </p>
              <div className="vy-actions">
                <Link
                  className="vy-button"
                  href={user ? (verified ? "/discover" : "/verify") : "/signup"}
                >
                  Discover your connection
                </Link>
                <Link className="vy-link" href="/privacy">
                  The Veyra promise
                </Link>
              </div>
              <p className="vy-muted">
                18+ access · Fictional characters aged 21+ · Always disclosed as
                AI
              </p>
            </div>
            <div className="vy-hero-visual">
              {verified && hero ? (
                <img
                  src={mediaUrl(hero)}
                  alt="AI-generated portrait of a fictional adult Veyra character"
                />
              ) : (
                <>
                  <div className="vy-halo" />
                  <span className="vy-monogram" aria-hidden="true">
                    V
                  </span>
                </>
              )}
              <div className="vy-visual-caption">
                <span className="vy-eyebrow">A WORLD BEYOND THE ORDINARY</span>
                <p>
                  {verified
                    ? "Entirely imagined. Unmistakably Veyra."
                    : "Your private introduction awaits."}
                </p>
                <small>
                  {verified
                    ? "AI-generated fictional adult portrait"
                    : "Sign in and complete your age check to explore."}
                </small>
              </div>
            </div>
          </section>
          <section className="vy-principles">
            <article>
              <h2>Distinctive personalities</h2>
              <p>
                Creative, curious, reflective. Find a fictional personality
                whose conversational style suits you.
              </p>
            </article>
            <article>
              <h2>Personal, with boundaries</h2>
              <p>
                Customize the tone and language. Every conversation stays
                respectful, non-explicit and clearly AI.
              </p>
            </article>
            <article>
              <h2>Privacy is part of the experience</h2>
              <p>
                Private history, account controls and age-restricted access.
                Your conversation belongs to your space.
              </p>
            </article>
          </section>
          <section className="vy-statement">
            <span className="vy-eyebrow">THE ART OF IMAGINED CONNECTION</span>
            <h2>
              Not a real person.
              <br />A space for a real conversation.
            </h2>
            <p>
              Our characters are invented adults, brought to life through
              generated visuals and AI dialogue. No hidden human identity. No
              promise to replace your relationships.
            </p>
          </section>
        </>
      ) : auth ? (
        <section className="vy-panel vy-auth">
          <span className="vy-eyebrow">YOUR PRIVATE INVITATION</span>
          <h1>{signup ? "Step into Veyra." : "Welcome back."}</h1>
          <p>
            Use your Veyra account. Access to profiles, media and chat requires
            an age check.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void action(async () => {
                await api(`auth/${signup ? "register" : "login"}`, "POST", {
                  email: f.get("email"),
                  password: f.get("password"),
                  ...(signup
                    ? {
                        name: f.get("name"),
                        adult: f.get("adult") === "on",
                        terms: f.get("terms") === "on",
                      }
                    : {}),
                });
                await refresh();
                router.push("/verify");
              });
            }}
          >
            {signup && (
              <label>
                Your name
                <input
                  name="name"
                  required
                  maxLength={60}
                  autoComplete="name"
                />
              </label>
            )}
            <label>
              Email
              <input
                name="email"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
              />
            </label>
            <label>
              Password · at least 12 characters
              <input
                name="password"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete={signup ? "new-password" : "current-password"}
              />
            </label>
            {signup && (
              <>
                <label className="vy-check">
                  <input type="checkbox" name="adult" required />I confirm I am
                  at least 18 years old.
                </label>
                <label className="vy-check">
                  <input type="checkbox" name="terms" required />I understand
                  all characters are fictional AI adults and agree to the{" "}
                  <Link href="/privacy">privacy and companion terms</Link>.
                </label>
              </>
            )}
            <button className="vy-button" disabled={busy}>
              {busy ? "One moment…" : signup ? "Create account" : "Sign in"}
            </button>
          </form>
          <p>
            <Link href={signup ? "/login" : "/signup"}>
              {signup ? "Already a member? Sign in" : "Create a Veyra account"}
            </Link>
          </p>
          <small>
            Email verification and password recovery are not connected in this
            private preview. Keep your password secure.
          </small>
        </section>
      ) : path === "/privacy" ? (
        <Privacy />
      ) : path === "/plans" ? (
        <Plans config={config} premium={premium} />
      ) : loading ? (
        <p className="vy-loading" role="status">
          Opening your private space…
        </p>
      ) : !user ? (
        gate
      ) : path === "/verify" ? (
        <Verify
          config={config}
          verified={verified}
          user={user}
          busy={busy}
          action={action}
          refresh={refresh}
        />
      ) : path === "/account" ? (
        <Account
          user={user}
          premium={premium}
          config={config}
          busy={busy}
          action={action}
          refresh={refresh}
          onDeleted={() => {
            setUser(null);
            setVerified(false);
            setPremium(false);
            router.push("/");
          }}
        />
      ) : !verified ? (
        gate
      ) : path === "/discover" ? (
        <Discovery />
      ) : path.startsWith("/models/") || path.startsWith("/gallery/") ? (
        <ModelProfile
          key={id}
          id={id}
          premium={premium}
          galleryOnly={path.startsWith("/gallery/")}
        />
      ) : path.startsWith("/chat/") ? (
        <Chat key={id} id={id} />
      ) : path === "/history" ? (
        <History />
      ) : path === "/admin" ? (
        user.role === "admin" ? (
          <Admin />
        ) : (
          <section className="vy-panel vy-empty">
            <h1>Private studio.</h1>
            <p>Administrator access is required.</p>
          </section>
        )
      ) : (
        <section className="vy-panel vy-empty">
          <h1>This page is not available.</h1>
          <Link href="/discover">Return to discovery</Link>
        </section>
      )}
      <footer className="vy-footer">
        <Link href="/" className="vy-logo">
          VEYRA<span>AI</span>
        </Link>
        <div>
          <p>HPSV Infra Tech LLP</p>
          <p className="vy-muted">
            Fictional AI adults 21+ · Access 18+ · Non-explicit experiences
          </p>
          <Link href="/privacy">Privacy & companion terms</Link>
        </div>
        <p className="vy-muted">
          AI companionship supports reflection.
          <br />
          It does not replace human relationships or professional care.
        </p>
      </footer>
    </main>
  );
}
function Verify({
  config,
  verified,
  user,
  busy,
  action,
  refresh,
}: {
  config: VeyraConfig | null;
  verified: boolean;
  user: VeyraUser;
  busy: boolean;
  action: (w: () => Promise<void>) => Promise<void>;
  refresh: () => Promise<void>;
}) {
  const [adult, setAdult] = useState(false);
  return (
    <section className="vy-panel vy-auth">
      <span className="vy-eyebrow">18+ RESTRICTED ACCESS</span>
      <h1>
        {verified ? "Your introduction is ready." : "A private age check."}
      </h1>
      {verified ? (
        <>
          <p>
            {user.age_method === "development-attestation"
              ? "Development access is active. This is self-attestation, not independent verification."
              : "Your age-assurance provider has confirmed current adult access."}
          </p>
          <Link className="vy-button" href="/discover">
            Explore the collection
          </Link>
        </>
      ) : config?.ageMode === "development-attestation" ? (
        <>
          <p>
            This local preview accepts your self-attestation. It cannot be used
            as production age verification.
          </p>
          <label className="vy-check">
            <input
              type="checkbox"
              checked={adult}
              onChange={(e) => setAdult(e.target.checked)}
            />
            I confirm I am 18 or older.
          </label>
          <button
            className="vy-button"
            disabled={!adult || busy}
            onClick={() =>
              void action(async () => {
                await api("age/development-attest", "POST", { adult });
                await refresh();
              })
            }
          >
            Enter development preview
          </button>
        </>
      ) : config?.ageMode === "provider" ? (
        <>
          <p>
            Continue with the configured age-assurance service. Veyra stores a
            verification result and expiry, not your identity documents or full
            date of birth.
          </p>
          <button
            className="vy-button"
            disabled={busy}
            onClick={() =>
              void action(async () => {
                const d = await api("age/start", "POST", {});
                window.location.assign(d.url);
              })
            }
          >
            Continue to age verification
          </button>
          <button
            className="vy-quiet"
            disabled={busy}
            onClick={() => void action(refresh)}
          >
            Check verification status
          </button>
        </>
      ) : (
        <>
          <p>
            Independent age verification has not been connected. Profiles,
            images and chat remain locked.
          </p>
          <Link className="vy-link" href="/account">
            Account & privacy controls
          </Link>
        </>
      )}
    </section>
  );
}
function Plans({
  config,
  premium,
}: {
  config: VeyraConfig | null;
  premium: boolean;
}) {
  return (
    <section className="vy-page">
      <div className="vy-page-heading">
        <span className="vy-eyebrow">CONNECTION, ON YOUR TERMS</span>
        <h1>Make room for more.</h1>
        <p>
          Membership infrastructure is prepared. Pricing and payment collection
          are not active.
        </p>
      </div>
      <div className="vy-plans">
        <article className="vy-panel">
          <span className="vy-eyebrow">DISCOVERY</span>
          <h2>A considered beginning.</h2>
          <p className="vy-price">Included</p>
          <ul>
            <li>
              {config?.plans.free.dailyMessages ?? "—"} conversation requests
              per UTC day
            </li>
            <li>Selected fictional AI personalities</li>
            <li>Private history and customization</li>
            <li>Account deletion and export</li>
          </ul>
          <Link className="vy-button vy-outline" href="/discover">
            Explore Discovery
          </Link>
        </article>
        <article className="vy-panel vy-featured">
          <span className="vy-eyebrow">PRIVATE CIRCLE</span>
          <h2>A more personal world.</h2>
          <p className="vy-price">Pricing pending</p>
          <ul>
            <li>
              {config?.plans.premium.dailyMessages ?? "—"} conversation requests
              per UTC day
            </li>
            <li>Premium fictional personalities</li>
            <li>Approved premium galleries</li>
            <li>Time-bound access, enforced on the server</li>
          </ul>
          <button className="vy-button" disabled>
            {premium
              ? "Your Private Circle access is active"
              : "Payments not enabled"}
          </button>
          <small>
            Access may be assigned manually by an authorized administrator for
            evaluation. No charge is collected.
          </small>
        </article>
      </div>
      <p className="vy-muted">
        Provider attempts, failed requests and retries count toward the daily
        allowance. AI identity and safety boundaries apply to every plan.
      </p>
    </section>
  );
}
function Account({
  user,
  premium,
  config,
  busy,
  action,
  refresh,
  onDeleted,
}: {
  user: VeyraUser;
  premium: boolean;
  config: VeyraConfig | null;
  busy: boolean;
  action: (w: () => Promise<void>) => Promise<void>;
  refresh: () => Promise<void>;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(user.name),
    [usage, setUsage] = useState(0);
  useEffect(() => {
    void api("account")
      .then((d) => setUsage(d.usage))
      .catch(() => {});
  }, []);
  return (
    <section className="vy-panel vy-reading">
      <span className="vy-eyebrow">ACCOUNT & PRIVACY</span>
      <h1>Your space. Your choices.</h1>
      <p>{user.email}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action(async () => {
            await api("account", "PUT", { name });
            await refresh();
          });
        }}
      >
        <label>
          Your name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            required
          />
        </label>
        <button className="vy-button vy-outline" disabled={busy}>
          Save profile
        </button>
      </form>
      <hr />
      <h2>{premium ? "Private Circle" : "Discovery"} access</h2>
      <p>
        {usage} requests today ·{" "}
        {premium
          ? config?.plans.premium.dailyMessages
          : config?.plans.free.dailyMessages}{" "}
        daily allowance. Resets at midnight UTC.
      </p>
      <p className="vy-muted">
        {user.access_blocked
          ? "Restricted access is suspended. Your account deletion and export controls remain available."
          : user.age_method === "development-attestation"
            ? "Age access: development self-attestation only."
            : user.age_verified_until
              ? `Age access expires ${new Date(user.age_verified_until).toLocaleDateString()}.`
              : "Age verification has not been completed."}
      </p>
      <Link href="/verify">Age verification settings</Link>
      <hr />
      <h2>Take your data with you</h2>
      <p>
        Download your Veyra account information, private conversation history,
        customization and reports.
      </p>
      <button
        className="vy-button vy-outline"
        disabled={busy}
        onClick={() =>
          void action(async () => {
            const data = await api("export");
            const url = URL.createObjectURL(
              new Blob([JSON.stringify(data, null, 2)], {
                type: "application/json",
              }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = "veyra-account-export.json";
            a.click();
            URL.revokeObjectURL(url);
          })
        }
      >
        Download account data
      </button>
      <hr />
      <h2>Delete your account</h2>
      <p>
        Permanently removes active account records, conversations,
        subscriptions, verification results and reports. Backups and external
        providers follow their own retention policies.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void action(async () => {
            await api("account", "DELETE", { password: f.get("password") });
            onDeleted();
          });
        }}
      >
        <label>
          Confirm your password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
          />
        </label>
        <label className="vy-check">
          <input type="checkbox" required />I understand this permanently
          deletes my Veyra data.
        </label>
        <button className="vy-button vy-danger" disabled={busy}>
          Delete Veyra account
        </button>
      </form>
      <small>Veyra account ID for operator support: {user.id}</small>
    </section>
  );
}
function History() {
  const [rows, setRows] = useState<
      {
        id: string;
        model_id: string;
        name: string;
        last_message_at: string | null;
      }[]
    >([]),
    [error, setError] = useState("");
  useEffect(() => {
    void api("conversations")
      .then((d) => setRows(d.conversations))
      .catch((e) => setError(e.message));
  }, []);
  return (
    <section className="vy-page">
      <div className="vy-page-heading">
        <span className="vy-eyebrow">YOUR PRIVATE CONVERSATIONS</span>
        <h1>Pick up the thread.</h1>
      </div>
      {error && (
        <p className="vy-error" role="alert">
          {error}
        </p>
      )}
      <div className="vy-history">
        {rows.map((c) => (
          <article className="vy-panel" key={c.id}>
            <h2>
              {c.name} <small>Fictional AI</small>
            </h2>
            <p>
              {c.last_message_at
                ? new Date(c.last_message_at).toLocaleString()
                : "Your first conversation is waiting."}
            </p>
            <Link href={`/chat/${c.model_id}`} className="vy-button vy-outline">
              Open conversation
            </Link>
          </article>
        ))}
        {!rows.length && (
          <p>No saved conversations yet. Explore a personality to begin.</p>
        )}
      </div>
    </section>
  );
}
function Privacy() {
  return (
    <section className="vy-panel vy-reading">
      <span className="vy-eyebrow">THE VEYRA PROMISE</span>
      <h1>
        Imagined openly.
        <br />
        Private by choice.
      </h1>
      <h2>Fictional adults, clearly disclosed</h2>
      <p>
        Every Veyra character is a fictional AI adult aged 21 or older.
        Generated portraits do not depict an actual model. Licensed assets
        require authorization and review; user uploads of real-person likenesses
        are not a companion-creation feature. All experiences remain
        non-explicit. Veyra is for users 18+, and does not replace real
        relationships, professional care or emergency services.
      </p>
      <h2>Age assurance</h2>
      <p>
        Production restricted access requires a signed result from a configured
        independent age-assurance service. Veyra retains the result, method,
        reference and expiry—not identity documents or a full date of birth.
        Development self-attestation is labelled and cannot grant production
        access. A payment card or subscription alone is not treated as proof of
        age.
      </p>
      <h2>Your conversations</h2>
      <p>
        History and customization are private to your Veyra account. Recent
        messages and settings go to the configured AI provider for replies.
        Provider retention and infrastructure backup policies must be reviewed
        before public launch. Preview replies are labelled when no live AI is
        connected. No payment collection is active.
      </p>
      <h2>Reporting and moderation</h2>
      <p>
        Reports share the details you choose with moderators. A private message
        excerpt is shared only if you explicitly select that option.
        Administrators can review reports and manage approved media; the admin
        dashboard does not expose everyone’s private transcripts. Media requires
        rights, fictional-adult and non-explicit review before publication.
      </p>
      <h2>Deletion and separate brands</h2>
      <p>
        You can clear conversations, export data or delete your account. Veyra
        records are separate from SoulNest accounts and memories. Account
        deletion removes active Veyra records; operational backups and external
        providers have their own retention policies. Deleted gallery objects are
        queued for storage cleanup after a ten-minute grace period, with retries
        during outages.
      </p>
      <p className="vy-muted">
        HPSV Infra Tech LLP · Private development release. Independent
        age-provider integration, email verification/recovery, live safety
        review and launch/payment approvals remain required before public
        launch.
      </p>
    </section>
  );
}
