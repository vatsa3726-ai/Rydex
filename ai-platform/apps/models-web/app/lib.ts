export type VeyraUser = {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  age_verified_until: string | null;
  age_method: string | null;
  access_blocked: boolean;
};
export type VeyraModel = {
  id: string;
  name: string;
  age: number;
  fictional: true;
  tagline: string;
  bio: string;
  personality: string;
  interests: string;
  tier: "free" | "premium";
  published: boolean;
  portrait_id?: string;
};
export type VeyraConfig = {
  ageMode: "provider" | "development-attestation" | "unavailable";
  provider: "openai" | "preview";
  plans: {
    free: { name: string; dailyMessages: number };
    premium: { name: string; dailyMessages: number };
  };
  paymentsEnabled: false;
};
export type Customization = {
  tone: string;
  language: string;
  preferences: string;
};
export async function api<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const r = await fetch(`/api/veyra/${path}`, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(45000),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }).catch(() => {
    throw Error("Veyra could not connect. Please try again.");
  });
  let data: any;
  try {
    data = await r.json();
  } catch {
    throw Error("Veyra could not connect. Please try again.");
  }
  if (!r.ok) {
    if (
      typeof window !== "undefined" &&
      r.status === 401 &&
      !path.startsWith("auth/")
    )
      window.dispatchEvent(new Event("veyra:expired"));
    if (typeof window !== "undefined" && data.code === "AGE_REQUIRED")
      window.dispatchEvent(new Event("veyra:age-required"));
    throw Error(data.error ?? "Please try again.");
  }
  return data;
}
export const mediaUrl = (id: string) =>
  `/api/veyra/media/${encodeURIComponent(id)}`;
