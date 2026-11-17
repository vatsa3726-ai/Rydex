export type User = { id: string; name: string; email: string };
export type Companion = {
  id: string;
  name: string;
  relationship: string;
  personality: string;
  tone: string;
  language: Language;
  instructions: string;
  interests: string;
  phrases: string;
  custom_label: string;
  memory_enabled: boolean;
  has_photo: boolean;
};
export type Profile = Omit<Companion, "id" | "memory_enabled" | "has_photo">;
export type Language = "en" | "kn" | "hi";
export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
};
export type Memory = { id: string; text: string };
export type Configuration = {
  provider: "preview" | "openai";
  voiceEnabled: boolean;
  paymentsEnabled: false;
  plans: {
    free: { companions: number; dailyMessages: number; dailyVoice: number };
  };
};
export const relationships = [
  ["father", "Dad"],
  ["mother", "Mom"],
  ["sister", "Sister"],
  ["brother", "Brother"],
  ["wife", "Wife"],
  ["husband", "Husband"],
  ["boyfriend", "Boyfriend"],
  ["girlfriend", "Girlfriend"],
  ["bestie", "Bestie"],
  ["friend", "Friend"],
  ["mentor", "Mentor"],
  ["custom", "Custom"],
] as const;
export const languages = [
  ["en", "English"],
  ["kn", "ಕನ್ನಡ"],
  ["hi", "हिन्दी"],
] as const;
export function profileFrom(companion?: Companion): Profile {
  return companion
    ? (Object.fromEntries(
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
        ].map((key) => [key, companion[key as keyof Companion]]),
      ) as Profile)
    : {
        name: "",
        relationship: "bestie",
        personality: "gentle",
        tone: "warm",
        language: "en",
        instructions: "",
        interests: "",
        phrases: "",
        custom_label: "",
      };
}
export function validateProfile(profile: Profile) {
  if (!profile.name.trim()) throw Error("Give your companion a name.");
  if (profile.name.trim().length > 60)
    throw Error("Keep the name under 60 characters.");
  if (profile.relationship === "custom" && !profile.custom_label.trim())
    throw Error("Add a custom relationship label.");
  return { ...profile, name: profile.name.trim() };
}
export function resolveApiUrl(
  value: string | undefined,
  development: boolean,
  localPreview = false,
  android = true,
) {
  const candidate =
    value ||
    (development
      ? android
        ? "http://10.0.2.2:4000/v2/soulnest"
        : "http://localhost:4000/v2/soulnest"
      : "");
  if (!candidate)
    throw Error("This build needs its HTTPS API address configured.");
  const url = new URL(candidate);
  const local =
    /^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(
      url.hostname,
    );
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["https:", "http:"].includes(url.protocol) ||
    (url.protocol !== "https:" && !(local && (development || localPreview)))
  )
    throw Error(
      "Use an HTTPS API address. HTTP is only supported for explicit local development.",
    );
  if (url.pathname.replace(/\/$/, "") !== "/v2/soulnest")
    throw Error("API address must end in /v2/soulnest.");
  return candidate.replace(/\/$/, "");
}
