"use client";
import { useState } from "react";
import type { Companion } from "../SoulNest";
const relationships = [
  "father",
  "mother",
  "brother",
  "sister",
  "husband",
  "wife",
  "boyfriend",
  "girlfriend",
  "bestie",
  "mentor",
  "custom",
];
export function CompanionForm({
  companion,
  loading,
  onSave,
}: {
  companion?: Companion;
  loading: boolean;
  onSave: (profile: Record<string, unknown>) => void;
}) {
  const [relationship, setRelationship] = useState(
    companion?.relationship ?? "bestie",
  );
  return (
    <section className="panel reading">
      <span className="eyebrow">MAKE IT FEEL FAMILIAR</span>
      <h1>
        {companion ? "A little more you." : "Who’s your kind of company?"}
      </h1>
      <p>
        Create a fictional AI companion. Names, photos and relationship styles
        never turn a simulation into a real person.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          onSave(
            Object.fromEntries(
              [
                "name",
                "relationship",
                "personality",
                "tone",
                "language",
                "instructions",
                "interests",
                "phrases",
                "custom_label",
              ].map((k) => [k, f.get(k) ?? ""]),
            ),
          );
        }}
      >
        <label>
          Name or nickname
          <input
            name="name"
            defaultValue={companion?.name}
            required
            maxLength={60}
            placeholder="A name you like"
          />
        </label>
        <div className="form-grid">
          <label>
            Relationship style
            <select
              name="relationship"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
            >
              {relationships.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label>
            Preferred language
            <select name="language" defaultValue={companion?.language ?? "en"}>
              <option value="en">English</option>
              <option value="hi">हिन्दी · Hindi</option>
              <option value="kn">ಕನ್ನಡ · Kannada</option>
            </select>
          </label>
          <label>
            Personality
            <select
              name="personality"
              defaultValue={companion?.personality ?? "gentle"}
            >
              {["gentle", "playful", "thoughtful", "motivating"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Emotional tone
            <select name="tone" defaultValue={companion?.tone ?? "warm"}>
              {["warm", "calm", "cheerful", "direct"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        </div>
        {relationship === "custom" ? (
          <label>
            Custom relationship label
            <input
              name="custom_label"
              defaultValue={companion?.custom_label}
              maxLength={60}
              required
              placeholder="For example: study buddy"
            />
          </label>
        ) : (
          <input type="hidden" name="custom_label" value="" />
        )}
        <label>
          How should your companion talk with you?
          <textarea
            name="instructions"
            defaultValue={companion?.instructions}
            maxLength={1000}
            rows={3}
            placeholder="Listen first, keep advice practical, and use short replies…"
          />
        </label>
        <label>
          Interests & conversation preferences
          <input
            name="interests"
            defaultValue={companion?.interests}
            maxLength={400}
            placeholder="Music, cricket, quiet mornings…"
          />
        </label>
        <label>
          Favourite phrases
          <input
            name="phrases"
            defaultValue={companion?.phrases}
            maxLength={300}
            placeholder="One step at a time"
          />
        </label>
        <p className="notice">
          Family, mentor and custom styles are platonic. Romantic styles are for
          adults, affectionate and non-explicit. Personalization cannot override
          safety boundaries.
        </p>
        <button className="primary" disabled={loading}>
          {loading
            ? "Saving…"
            : companion
              ? "Save companion"
              : "Create companion"}
        </button>
        <small>
          You can add an authorized photo and manage optional memory from the
          companion’s chat settings.
        </small>
      </form>
    </section>
  );
}
