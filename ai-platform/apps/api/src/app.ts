import Fastify from "fastify";
import cors from "@fastify/cors";
import { randomUUID } from "node:crypto";
import type { Database } from "./database.js";
import { registerMvp } from "./mvp.js";
import type { PhotoStorage } from "./photo-storage.js";
import {
  boundaries,
  roles,
  PreviewProvider,
  type CompanionProvider,
  type Message,
  type Role,
} from "./companion.js";
type Session = {
  role: Role;
  consent: boolean;
  memories: Map<string, string>;
  updated: number;
};
export async function buildApp(
  provider: CompanionProvider = new PreviewProvider(),
  database?: Database,
  mvpProvider?: CompanionProvider,
  photoStorage?: PhotoStorage,
) {
  const app = Fastify({ logger: false, bodyLimit: 8_000_000 });
  const sessions = new Map<string, Session>();
  const allowed = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  await app.register(cors, { origin: allowed.length ? allowed : false });
  const cleanup = setInterval(() => {
    for (const [id, s] of sessions)
      if (Date.now() - s.updated > 3_600_000) sessions.delete(id);
  }, 60_000);
  cleanup.unref();
  app.addHook("onClose", async () => {
    clearInterval(cleanup);
    sessions.clear();
  });
  app.addHook("onRequest", async (req, reply) => {
    if (!req.url.startsWith("/v1/soulnest")) return;
    reply.header("Cache-Control", "no-store");
    if (database)
      return reply.code(410).send({
        error:
          "The anonymous preview has been retired. Use your private SoulNest account.",
      });
    if (
      req.method === "OPTIONS" ||
      req.url === "/v1/soulnest/companions" ||
      (req.method === "POST" && req.url === "/v1/soulnest/sessions")
    )
      return;
    const token = req.headers.authorization?.replace(/^Bearer /, "");
    const s = token ? sessions.get(token) : undefined;
    if (!s || Date.now() - s.updated > 3_600_000) {
      if (token) sessions.delete(token);
      return reply
        .code(401)
        .send({ error: "Session expired. Start a new conversation." });
    }
    s.updated = Date.now();
  });
  const session = (auth?: string) =>
    sessions.get(auth?.replace(/^Bearer /, "") ?? "")!;
  const object = (properties: object, required: string[]) => ({
    type: "object",
    additionalProperties: false,
    properties,
    required,
  });
  app.get("/health", async () => ({
    status: "ok",
    service: "ai-platform-api",
  }));
  app.get("/v1/brands", async () => ({
    brands: [
      { id: "soulnest", name: "SoulNest" },
      { id: "veyra", name: "Veyra AI", ageRestricted: true },
    ],
  }));
  app.get("/v1/soulnest/companions", async () => ({
    companions: roles,
    mode: "preview",
  }));
  app.post<{ Body: { role: Role } }>(
    "/v1/soulnest/sessions",
    {
      schema: {
        body: object({ role: { type: "string", enum: Object.keys(roles) } }, [
          "role",
        ]),
      },
    },
    async (req, reply) => {
      if (sessions.size >= 1000)
        return reply
          .code(503)
          .send({ error: "Preview is busy. Please try later." });
      const token = randomUUID();
      sessions.set(token, {
        role: req.body.role,
        consent: false,
        memories: new Map(),
        updated: Date.now(),
      });
      return {
        token,
        mode: "preview",
        opening: `I’m your ${roles[req.body.role].name.toLowerCase()}-style AI companion. ${roles[req.body.role].opening}`,
      };
    },
  );
  app.delete("/v1/soulnest/session", async (req) => {
    sessions.delete(req.headers.authorization!.replace(/^Bearer /, ""));
    return { deleted: true };
  });
  app.get("/v1/soulnest/memories", async (req) => {
    const s = session(req.headers.authorization);
    return {
      consent: s.consent,
      memories: [...s.memories].map(([id, text]) => ({ id, text })),
    };
  });
  app.put<{ Body: { enabled: boolean } }>(
    "/v1/soulnest/consent",
    { schema: { body: object({ enabled: { type: "boolean" } }, ["enabled"]) } },
    async (req) => {
      const s = session(req.headers.authorization);
      s.consent = req.body.enabled;
      if (!s.consent) s.memories.clear();
      return { consent: s.consent };
    },
  );
  app.post<{ Body: { text: string } }>(
    "/v1/soulnest/memories",
    {
      schema: {
        body: object(
          { text: { type: "string", minLength: 1, maxLength: 300 } },
          ["text"],
        ),
      },
    },
    async (req, reply) => {
      const s = session(req.headers.authorization);
      if (!s.consent)
        return reply.code(403).send({ error: "Enable memory before saving." });
      if (!req.body.text.trim())
        return reply.code(400).send({ error: "Enter a memory." });
      if (s.memories.size >= 20)
        return reply
          .code(409)
          .send({ error: "Remove a memory before adding another." });
      const id = randomUUID();
      s.memories.set(id, req.body.text.trim());
      return { id, text: req.body.text.trim() };
    },
  );
  app.delete<{ Params: { id: string } }>(
    "/v1/soulnest/memories/:id",
    async (req) => {
      session(req.headers.authorization).memories.delete(req.params.id);
      return { deleted: true };
    },
  );
  app.post<{ Body: { messages: Message[] } }>(
    "/v1/soulnest/chat",
    {
      schema: {
        body: object(
          {
            messages: {
              type: "array",
              minItems: 1,
              maxItems: 40,
              items: object(
                {
                  role: { type: "string", enum: ["user", "assistant"] },
                  content: { type: "string", minLength: 1, maxLength: 2000 },
                },
                ["role", "content"],
              ),
            },
          },
          ["messages"],
        ),
      },
    },
    async (req, reply) => {
      if (
        req.body.messages.at(-1)?.role !== "user" ||
        req.body.messages.some((m) => !m.content.trim())
      )
        return reply
          .code(400)
          .send({ error: "A nonempty user message must be last." });
      const s = session(req.headers.authorization);
      try {
        return {
          role: "assistant",
          content: await provider.reply({
            system: `${boundaries}\nStyle: ${roles[s.role].style}`,
            messages: req.body.messages,
            memories: s.consent ? [...s.memories.values()] : [],
          }),
          mode: "preview",
        };
      } catch {
        return reply
          .code(503)
          .send({ error: "Your companion is unavailable. Please try again." });
      }
    },
  );
  app.setNotFoundHandler((_req, reply) =>
    reply.code(404).send({ error: "Not found" }),
  );
  if (database) await registerMvp(app, database, mvpProvider, photoStorage);
  return app;
}
