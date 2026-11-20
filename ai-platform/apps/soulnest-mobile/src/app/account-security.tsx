import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Configuration } from "../lib/domain";
import {
  Body,
  Button,
  Card,
  ErrorText,
  Field,
  Screen,
  Title,
  useTask,
} from "../components/ui";
export default function AccountSecurity() {
  const auth = useAuth(),
    task = useTask(),
    params = useLocalSearchParams<{ mode?: string }>();
  const [email, setEmail] = useState(auth.user?.email ?? ""),
    [token, setToken] = useState(""),
    [password, setPassword] = useState(""),
    [purpose, setPurpose] = useState<"verify" | "reset">(
      params.mode === "reset" ? "reset" : "verify",
    ),
    [notice, setNotice] = useState(""),
    [config, setConfig] = useState<Configuration | null>(null);
  useEffect(() => {
    void api<Configuration>("config")
      .then(setConfig)
      .catch((e) => task.setError(e.message));
  }, []);
  return (
    <Screen>
      <Title eyebrow="ACCOUNT SECURITY">Your account, protected.</Title>
      <Body>
        {purpose === "verify"
          ? "Verify the email address on your SoulNest account."
          : "Recover your account with a one-time email token."}
      </Body>
      <Card>
        <Button
          outline
          title={
            purpose === "verify"
              ? "I need to reset my password"
              : "I need to verify my email"
          }
          onPress={() => {
            setPurpose(purpose === "verify" ? "reset" : "verify");
            setToken("");
            setPassword("");
            setNotice("");
            task.setError("");
          }}
        />
        <Field
          label="Email address"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          maxLength={254}
        />
        {!config?.emailEnabled && (
          <Body small>
            Account email delivery has not been connected in this preview. Your
            existing password still works.
          </Body>
        )}
        <Button
          title={
            purpose === "verify"
              ? "Send verification email"
              : "Send password recovery email"
          }
          disabled={task.busy || !email.trim() || !config?.emailEnabled}
          onPress={() =>
            void task.run(async () => {
              const r = await api(
                `auth/${purpose === "verify" ? "request-verification" : "forgot-password"}`,
                "POST",
                { email: email.trim() },
              );
              setNotice(r.notice);
            })
          }
        />
        <Field
          label="One-time token from your email"
          value={token}
          onChangeText={setToken}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={64}
        />
        {purpose === "reset" && (
          <Field
            label="New password · at least 12 characters"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            maxLength={128}
          />
        )}
        <Button
          title={
            purpose === "verify"
              ? "Verify email"
              : "Reset password and sign out all devices"
          }
          disabled={
            task.busy ||
            token.trim().length !== 64 ||
            !email.trim() ||
            (purpose === "reset" && password.length < 12)
          }
          onPress={() =>
            void task.run(async () => {
              await api(
                `auth/${purpose === "verify" ? "verify-email" : "reset-password"}`,
                "POST",
                {
                  email: email.trim(),
                  token: token.trim(),
                  ...(purpose === "reset" ? { password } : {}),
                },
              );
              setToken("");
              setPassword("");
              if (purpose === "reset") {
                await auth.clearLocal();
                setNotice("Password reset. Sign in with your new password.");
              } else {
                if (auth.user) await auth.reload();
                setNotice(
                  "Email verified. You can continue to your companions.",
                );
              }
            })
          }
        />
        {notice && <Body>{notice}</Body>}
        <ErrorText error={task.error} />
      </Card>
      <Button
        outline
        title={auth.user ? "Account & privacy settings" : "Back to sign in"}
        onPress={() => router.replace(auth.user ? "/settings" : "/sign-in")}
      />
      {auth.user && (
        <Button
          outline
          title="Refresh verification status"
          disabled={task.busy}
          onPress={() => void task.run(() => auth.reload())}
        />
      )}
      {auth.user &&
        (!auth.user.verification_required || auth.user.email_verified_at) && (
          <Button
            title="Open my companions"
            onPress={() => router.replace("/gallery")}
          />
        )}
    </Screen>
  );
}
