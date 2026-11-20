export interface AccountMailer {
  send(input: {
    to: string;
    purpose: "verify" | "reset";
    token: string;
    link: string;
  }): Promise<void>;
}
export function configuredAccountMailer(): AccountMailer | undefined {
  const key = process.env.SOULNEST_EMAIL_API_KEY,
    from = process.env.SOULNEST_EMAIL_FROM;
  if (process.env.SOULNEST_EMAIL_PROVIDER !== "resend" || !key || !from) return;
  if (/[\r\n]/.test(from)) throw Error("Invalid email sender");
  return {
    async send({ to, purpose, token, link }) {
      const action =
        purpose === "verify"
          ? "Verify your SoulNest email"
          : "Reset your SoulNest password";
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject: action,
          text: `${action}\n\nOpen this link: ${link}\n\nOr paste this one-time security token in SoulNest:\n${token}\n\n${purpose === "verify" ? "This token expires in 24 hours." : "This token expires in 30 minutes. Resetting your password signs out all devices."}\n\nIf you did not request this, you can ignore this email. Never share the token.\nHPSV Infra Tech LLP`,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw Error("Account email delivery is unavailable");
    },
  };
}
