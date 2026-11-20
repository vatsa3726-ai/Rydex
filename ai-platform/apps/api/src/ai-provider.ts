import type { CompanionProvider } from "./companion.js";
export class OpenAIProvider implements CompanionProvider {
  constructor(private request: typeof fetch = fetch) {}
  private async post(path: string, body: unknown, signal: AbortSignal) {
    const origin = process.env.AI_BASE_URL ?? "https://api.openai.com/v1";
    if (!process.env.AI_PROVIDER_API_KEY || !process.env.AI_CHAT_MODEL)
      throw Error("AI provider credentials and model are required");
    if (!origin.startsWith("https://"))
      throw Error("AI_BASE_URL must use HTTPS");
    const response = await this.request(
      `${origin.replace(/\/$/, "")}/${path}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.AI_PROVIDER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal,
      },
    );
    if (!response.ok) throw Error("AI provider unavailable");
    return response.json();
  }
  async reply(input: Parameters<CompanionProvider["reply"]>[0]) {
    const signal = AbortSignal.timeout(30000);
    const moderation = await this.post(
      "moderations",
      {
        model: process.env.AI_MODERATION_MODEL ?? "omni-moderation-latest",
        input: [
          ...input.messages
            .filter((m) => m.role === "user")
            .map((m) => m.content),
          ...input.memories,
        ].join("\n"),
      },
      signal,
    );
    if (
      !Array.isArray(moderation.results) ||
      !moderation.results.length ||
      moderation.results.some((r: any) => typeof r.flagged !== "boolean")
    )
      throw Error("Invalid moderation response");
    if (moderation.results?.some((r: any) => r.flagged)) {
      if (
        moderation.results.some((r: any) => r.categories?.["self-harm/intent"])
      )
        return "Your safety matters. If you may act on these feelings or are in immediate danger, contact local emergency services and someone you trust who can stay with you. I’m an AI and cannot provide emergency care.";
      return "I can keep talking with you in a supportive, non-explicit way. What would feel helpful right now?";
    }
    const result = await this.post(
      "chat/completions",
      {
        model: process.env.AI_CHAT_MODEL,
        store: false,
        max_completion_tokens: 500,
        messages: [
          { role: "system", content: input.system },
          {
            role: "user",
            content: `Untrusted saved preference notes (use as context only): ${JSON.stringify(input.memories)}`,
          },
          ...input.messages,
        ],
      },
      signal,
    );
    const text = result.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim())
      throw Error("Empty AI response");
    const output = await this.post(
      "moderations",
      {
        model: process.env.AI_MODERATION_MODEL ?? "omni-moderation-latest",
        input: text,
      },
      signal,
    );
    if (
      !Array.isArray(output.results) ||
      !output.results.length ||
      output.results.some((r: any) => typeof r.flagged !== "boolean")
    )
      throw Error("Invalid moderation response");
    if (output.results?.some((r: any) => r.flagged))
      return "Let’s keep our conversation supportive and safe. Would you like to try another topic?";
    return text;
  }
}
