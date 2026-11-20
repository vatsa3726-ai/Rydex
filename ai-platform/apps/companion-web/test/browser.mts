import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { isolatedTestEnvironment } from "../../api/scripts/test-environment.mjs";
process.env = isolatedTestEnvironment();
const { buildApp } = await import("../../api/src/app.js");
import { createDatabase } from "../../api/src/database.js";
const workspace = fileURLToPath(new URL("../../../", import.meta.url));
const base = process.env.TEST_WEB_ORIGIN ?? "http://127.0.0.1:3100";
let server: ChildProcess | undefined;
const db = await createDatabase("", ":memory:");
const inbox: { to: string; token: string; purpose: string; link: string }[] =
  [];
const app = await buildApp(undefined, db, undefined, undefined, undefined, {
  origin: base,
  requireVerifiedEmail: true,
  mailer: {
    async send(input) {
      inbox.push(input);
    },
  },
});
await app.listen({ port: 0, host: "127.0.0.1" });
const address = app.server.address();
assert.ok(address && typeof address !== "string");
const apiOrigin = `http://127.0.0.1:${address.port}/v2/soulnest`;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.E2E_BROWSER_EXECUTABLE
    ? { executablePath: process.env.E2E_BROWSER_EXECUTABLE }
    : {}),
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.route("**/api/soulnest/**", async (route) => {
  const url = route
    .request()
    .url()
    .replace(base + "/api/soulnest", apiOrigin);
  const response = await route.fetch({ url });
  await route.fulfill({ response });
});
const email = `soulnest-browser-${Date.now()}@example.test`,
  password = "strong temporary browser password",
  nextPassword = "changed temporary browser password";
try {
  if (!process.env.TEST_WEB_ORIGIN)
    server = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "apps/companion-web",
        "-p",
        "3100",
        "-H",
        "127.0.0.1",
      ],
      {
        cwd: workspace,
        env: { ...process.env, NODE_ENV: "production" },
        stdio: "inherit",
      },
    );
  let healthy = false;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base)).ok) {
        healthy = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.ok(healthy, "Built SoulNest site responds");
  await page.goto(base + "/signup");
  await page.getByLabel("Your name", { exact: true }).fill("Browser QA");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password · at least 12 characters").fill(password);
  await page.locator("input[name=adult]").check();
  await page.locator("input[name=terms]").check();
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Verify your email to continue." })
    .waitFor();
  await page.getByRole("link", { name: "Verify email", exact: true }).click();
  await page
    .getByRole("button", { name: "Send verification email", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: /account email will arrive/ })
    .waitFor();
  assert.equal(inbox.at(-1)?.purpose, "verify");
  await page
    .getByLabel("One-time token from your email")
    .fill(inbox.at(-1)!.token);
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await page
    .getByText("Email verified. You can continue to your companions.")
    .waitFor();
  await page.goto(base + "/create");
  await page.getByLabel("Name or nickname").fill("Mira");
  await page.locator("select[name=relationship]").selectOption("friend");
  await page.locator("select[name=language]").selectOption("kn");
  await page
    .getByRole("button", { name: "Create companion", exact: true })
    .click();
  await page.waitForURL("**/chat/**");
  await page
    .getByRole("textbox", { name: "Your message" })
    .fill("How can I make a calm evening?");
  await page.getByRole("button", { name: /^Send/ }).click();
  await page.locator(".bubble.assistant").waitFor();
  assert.equal(await page.locator(".bubble").count(), 2);
  await page.reload();
  await page.locator(".bubble.assistant").waitFor();
  assert.equal(
    await page.locator(".bubble").count(),
    2,
    "Private history survives reload",
  );
  await page.getByLabel("Allow saved memories").click();
  await page.getByLabel("A note to remember").waitFor();
  await page.getByLabel("A note to remember").fill("I prefer short replies.");
  await page
    .getByRole("button", { name: "Save this note", exact: true })
    .click();
  await page
    .getByRole("listitem")
    .filter({ hasText: "I prefer short replies." })
    .waitFor();
  await page.getByRole("button", { name: "Report reply", exact: true }).click();
  await page
    .getByLabel("What should be reviewed?")
    .fill("Please review this synthetic reply.");
  assert.equal(
    await page.getByRole("checkbox", { name: /Share up to 500/ }).isChecked(),
    false,
  );
  await page.getByRole("button", { name: "Send report", exact: true }).click();
  await page
    .getByText(
      "Your report is saved for review. This is not an emergency service.",
    )
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "No horizontal overflow at phone width",
  );
  await page.goto(base + "/settings");
  await page.getByRole("heading", { name: "Your choices." }).waitFor();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download account data", exact: true })
    .click();
  const download = await downloaded;
  const path = await download.path();
  assert.ok(path);
  const data = JSON.parse(await readFile(path, "utf8"));
  assert.equal(data.companions.length, 1);
  assert.equal(data.reports.length, 1);
  assert.equal(data.reports[0].excerpt, null);
  assert.equal(data.companions[0].memories[0].text, "I prefer short replies.");
  await download.delete();
  await page.getByLabel("Current password", { exact: true }).fill(password);
  await page
    .getByLabel("New password · at least 12 characters")
    .fill(nextPassword);
  await page
    .getByRole("button", {
      name: "Change password & sign out all devices",
      exact: true,
    })
    .click();
  await page.waitForURL(base + "/");
  await page.goto(base + "/account-security#purpose=reset");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByRole("button", { name: "Send recovery email", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: /account email will arrive/ })
    .waitFor();
  assert.equal(inbox.at(-1)?.purpose, "reset");
  await page
    .getByLabel("One-time token from your email")
    .fill(inbox.at(-1)!.token);
  await page.getByLabel("New password · at least 12 characters").fill(password);
  await page
    .getByRole("button", {
      name: "Reset password and sign out all devices",
      exact: true,
    })
    .click();
  await page
    .getByText("Password reset. Sign in again on each device.")
    .waitFor();
  await page.goto(base + "/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password · at least 12 characters").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/dashboard");
  await page.getByText("Mira", { exact: true }).first().waitFor();
  assert.deepEqual(errors, [], "No browser runtime errors");
  console.log(
    "SoulNest browser checks passed: verification gate, email proof, Friend creation, Kannada chat, private history, consent-based memory/reporting, full export, password change/recovery and 390px layout. Synthetic email delivery only.",
  );
} catch (error) {
  await mkdir(new URL("../test-results/", import.meta.url), {
    recursive: true,
  });
  await page.screenshot({
    path: fileURLToPath(
      new URL("../test-results/failure.png", import.meta.url),
    ),
    fullPage: true,
    mask: [
      page.locator("input[type=password]"),
      page.getByLabel("One-time token from your email"),
    ],
  });
  throw error;
} finally {
  await browser.close();
  await app.close();
  await db.close();
  server?.kill("SIGTERM");
}
