import { previewConnectionEnabled } from "../lib/api";
import { useState } from "react";
import { router, useLocalSearchParams, Redirect } from "expo-router";
import { useAuth } from "../lib/auth";
import {
  Screen,
  Title,
  Body,
  Field,
  Button,
  Check,
  ErrorText,
  useTask,
  Loading,
} from "../components/ui";
export default function SignIn() {
  const { mode } = useLocalSearchParams<{ mode: string }>();
  const [register, setRegister] = useState(mode === "register"),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [adult, setAdult] = useState(false),
    [terms, setTerms] = useState(false);
  const auth = useAuth(),
    task = useTask();
  if (auth.loading) return <Loading />;
  if (auth.user)
    return (
      <Redirect
        href={
          auth.user.verification_required && !auth.user.email_verified_at
            ? "/account-security"
            : "/gallery"
        }
      />
    );
  return (
    <Screen>
      <Title eyebrow="YOUR OWN LITTLE CORNER">
        {register ? "Start something caring." : "Good to see you."}
      </Title>
      <Body>
        Your companions and conversations stay in your private account.
      </Body>
      {register && (
        <Field
          label="Your name"
          value={name}
          onChangeText={setName}
          maxLength={60}
          textContentType="name"
        />
      )}
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="emailAddress"
        maxLength={254}
      />
      <Field
        label="Password · at least 12 characters"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType={register ? "newPassword" : "password"}
        maxLength={128}
      />
      {register && (
        <>
          <Check value={adult} onChange={setAdult}>
            I confirm I am at least 18 years old.
          </Check>
          <Check value={terms} onChange={setTerms}>
            I understand companions are fictional AI and agree to the privacy
            and companion terms.
          </Check>
          <Button
            outline
            title="Read privacy & companion terms"
            onPress={() => router.push("/privacy")}
          />
        </>
      )}
      <ErrorText error={task.error || auth.error} />
      <Button
        title={
          task.busy ? "One moment…" : register ? "Create account" : "Sign in"
        }
        disabled={
          task.busy ||
          !email.trim() ||
          password.length < 12 ||
          (register && (!name.trim() || !adult || !terms))
        }
        onPress={() =>
          void task.run(async () => {
            await auth.signIn(
              {
                email: email.trim(),
                password,
                ...(register ? { name: name.trim(), adult, terms } : {}),
              },
              register,
            );
            setPassword("");
            router.replace("/gallery");
          })
        }
      />
      <Button
        title={
          register
            ? "Already have an account? Sign in"
            : "New here? Create an account"
        }
        outline
        onPress={() => {
          setRegister(!register);
          task.setError("");
        }}
      />
      {previewConnectionEnabled() && (
        <Button
          outline
          title="Preview connection settings"
          onPress={() => router.push("/connection")}
        />
      )}
      <Button
        outline
        title="Forgot password or verify email"
        onPress={() =>
          router.push({
            pathname: "/account-security",
            params: { mode: "reset" },
          })
        }
      />
    </Screen>
  );
}
