import { useState } from "react";
import { Alert, Platform } from "react-native";
import { router, Redirect } from "expo-router";
import {
  apiBase,
  previewConnectionEnabled,
  savePreviewConnection,
} from "../lib/api";
import { resolveApiUrl } from "../lib/domain";
import { useAuth } from "../lib/auth";
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
export default function Connection() {
  const auth = useAuth(),
    task = useTask();
  const [address, setAddress] = useState(() => {
    try {
      return apiBase();
    } catch {
      return "";
    }
  });
  if (!previewConnectionEnabled()) return <Redirect href="/" />;
  return (
    <Screen>
      <Title eyebrow="LOCAL PREVIEW CONNECTION">Connect this preview.</Title>
      <Body>
        On a physical phone, use your trusted computer’s local network address.
        The Android emulator can use 10.0.2.2.
      </Body>
      <Card>
        <Field
          label="SoulNest API address"
          value={address}
          onChangeText={setAddress}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="http://192.168.1.10:4000/v2/soulnest"
        />
        <Body small>
          Use only a server you trust. Changing the address signs you out and
          clears this device’s session. If the old server cannot be reached, its
          session expires within seven days.
        </Body>
        <Button
          title="Connect and return to sign in"
          disabled={task.busy || !address.trim()}
          onPress={() => {
            try {
              resolveApiUrl(
                address.trim(),
                __DEV__,
                true,
                Platform.OS === "android",
              );
            } catch (e) {
              task.setError((e as Error).message);
              return;
            }
            Alert.alert(
              "Change this preview’s server?",
              "Your password is never sent during this connection check. Use only your trusted SoulNest server.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Connect",
                  onPress: () =>
                    void task.run(async () => {
                      try {
                        await auth.signOut();
                      } catch {}
                      await savePreviewConnection(address.trim());
                      router.replace("/sign-in");
                    }),
                },
              ],
            );
          }}
        />
        <ErrorText error={task.error} />
      </Card>
      <Body small>
        The server must be running and reachable on your network. Store builds
        do not offer this setting and require a configured HTTPS API.
      </Body>
    </Screen>
  );
}
