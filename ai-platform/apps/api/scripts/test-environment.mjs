// Keep test commands away from any real database, mailbox, object store or AI key.
export function isolatedTestEnvironment(source = process.env) {
  const env = { ...source };
  for (const key of Object.keys(env))
    if (
      /^(DATABASE_URL$|PG[A-Z_]|AI_|VEYRA_|SOULNEST_|OBJECT_STORAGE_|PHOTO_STORAGE$|PUBLIC_ORIGIN$|RENDER_EXTERNAL_|CORS_ORIGINS$|FREE_|PREMIUM_)/.test(
        key,
      )
    )
      delete env[key];
  return {
    ...env,
    NODE_ENV: "test",
    DATABASE_URL: "",
    AI_PROVIDER: "preview",
    PHOTO_STORAGE: "local",
    VEYRA_AI_PROVIDER: "preview",
    FREE_COMPANIONS: "3",
    FREE_DAILY_MESSAGES: "30",
    FREE_DAILY_VOICE: "5",
    PREMIUM_COMPANIONS: "10",
    PREMIUM_DAILY_MESSAGES: "300",
    PREMIUM_DAILY_VOICE: "50",
    VEYRA_FREE_DAILY_MESSAGES: "20",
    VEYRA_PREMIUM_DAILY_MESSAGES: "200",
  };
}
