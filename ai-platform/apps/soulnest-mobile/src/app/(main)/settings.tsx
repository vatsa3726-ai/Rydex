import { useCallback, useState } from "react";
import { Alert, Linking, Text } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { api, apiBase, clearToken } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import {
  disableReminder,
  enableReminder,
  reminderEnabled,
} from "../../lib/notifications";
import { type Configuration } from "../../lib/domain";
import {
  Body,
  Button,
  Card,
  Check,
  ErrorText,
  Field,
  Screen,
  Title,
  ui,
  useTask,
} from "../../components/ui";
export default function Settings() {
  const auth = useAuth(),
    task = useTask();
  const [config, setConfig] = useState<Configuration | null>(null),
    [usage, setUsage] = useState<{ kind: string; count: number }[]>([]),
    [name, setName] = useState(auth.user?.name ?? ""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(false),
    [reminder, setReminder] = useState(false);
  useFocusEffect(
    useCallback(() => {
      void Promise.all([
        api<Configuration>("config"),
        api<{ usage: { kind: string; count: number }[] }>("account"),
        reminderEnabled(),
      ])
        .then(([c, a, r]) => {
          setConfig(c);
          setUsage(a.usage);
          setReminder(r);
        })
        .catch((e) => task.setError(e.message));
    }, []),
  );
  return (
    <Screen>
      <Title eyebrow="YOUR CHOICES">A space of your own.</Title>
      <Body>{auth.user?.email}</Body>
      <Card>
        <Text style={ui.h2}>Personal profile</Text>
        <Field
          label="Your name"
          value={name}
          onChangeText={setName}
          maxLength={60}
        />
        <Button
          outline
          title="Save name"
          disabled={task.busy || !name.trim()}
          onPress={() =>
            void task.run(async () => {
              await api("account", "PUT", { name: name.trim() });
              await auth.reload();
            })
          }
        />
      </Card>
      <Card>
        <Text style={ui.h2}>Free, with room to begin</Text>
        <Body>
          {config
            ? `${config.plans.free.companions} companions · ${config.plans.free.dailyMessages} chat requests · ${config.plans.free.dailyVoice} voice requests per UTC day.`
            : "Loading plan…"}
        </Body>
        <Body small>
          Today: {usage.find((u) => u.kind === "chat")?.count ?? 0} chat and{" "}
          {usage.find((u) => u.kind === "voice")?.count ?? 0} voice requests.
          Failed provider requests and retries count toward limits.
        </Body>
        <Text style={ui.h2}>Premium · Coming soon</Text>
        <Body small>
          Additional companions and higher limits are prepared. Pricing and
          app-store billing are not approved or enabled. No payments are
          collected.
        </Body>
      </Card>
      <Card>
        <Text style={ui.h2}>A gentle reminder</Text>
        <Check
          value={reminder}
          onChange={(value) =>
            void task.run(async () => {
              if (value) await enableReminder();
              else await disableReminder();
              setReminder(value);
            })
          }
        >
          A daily reflection reminder at 7 pm, local time.
        </Check>
        <Body small>
          Optional local notification. No companion name, private message or
          emotional pressure appears on your lock screen. Delivery depends on
          phone settings.
        </Body>
        <Button
          title="Open phone settings"
          outline
          onPress={() => void Linking.openSettings()}
        />
      </Card>
      <Button
        title="Privacy & companion terms"
        outline
        onPress={() => router.push("/privacy")}
      />
      <Button
        title="Sign out"
        disabled={task.busy}
        outline
        onPress={() =>
          void task.run(async () => {
            try {
              await auth.signOut();
            } finally {
              router.replace("/");
            }
          })
        }
      />
      <Card>
        <Text style={ui.h2}>Delete account</Text>
        <Body small>
          This permanently deletes active account records, companions, messages
          and memories. Private photo objects are queued for cleanup. Backups
          and external providers have their own retention policies.
        </Body>
        <Field
          label="Confirm your password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          maxLength={128}
        />
        <Check value={confirm} onChange={setConfirm}>
          I understand this cannot be undone.
        </Check>
        <Button
          title="Delete account permanently"
          danger
          disabled={task.busy || !confirm || !password}
          onPress={() =>
            Alert.alert(
              "Permanently delete your account?",
              "This removes all active SoulNest account data.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete account",
                  style: "destructive",
                  onPress: () =>
                    void task.run(async () => {
                      await api("account", "DELETE", { password });
                      setPassword("");
                      await auth.clearLocal();
                      router.replace("/");
                    }),
                },
              ],
            )
          }
        />
      </Card>
      <ErrorText error={task.error} />
      <Body small>
        {config?.provider === "openai"
          ? "Live provider configured; AI identity remains disclosed."
          : "Preview replies only. Live AI and speech credentials are not configured."}
      </Body>
      <Body small>
        HPSV Infra Tech LLP · SoulNest 0.2 ·{" "}
        {process.env.EXPO_PUBLIC_LOCAL_PREVIEW === "1"
          ? "LOCAL PREVIEW — requires the local API"
          : "Private MVP"}
      </Body>
    </Screen>
  );
}
