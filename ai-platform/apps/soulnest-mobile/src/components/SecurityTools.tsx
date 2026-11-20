import { useState } from "react";
import { Alert } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { router } from "expo-router";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Body, Button, Card, Check, ErrorText, Field, useTask } from "./ui";
export function SecurityTools() {
  const auth = useAuth(),
    task = useTask();
  const [current, setCurrent] = useState(""),
    [next, setNext] = useState(""),
    [confirmExport, setConfirmExport] = useState(false);
  return (
    <>
      <Card>
        <Body>
          Email status:{" "}
          {auth.user?.email_verified_at ? "Verified" : "Not verified"}
        </Body>
        <Button
          outline
          title="Email verification & recovery"
          onPress={() => router.push("/account-security")}
        />
        <Field
          label="Current password"
          value={current}
          onChangeText={setCurrent}
          secureTextEntry
          maxLength={128}
        />
        <Field
          label="New password · at least 12 characters"
          value={next}
          onChangeText={setNext}
          secureTextEntry
          maxLength={128}
        />
        <Button
          outline
          title="Change password & sign out all devices"
          disabled={task.busy || !current || next.length < 12}
          onPress={() =>
            void task.run(async () => {
              await api("account/password", "PUT", {
                currentPassword: current,
                newPassword: next,
              });
              setCurrent("");
              setNext("");
              await auth.clearLocal();
              router.replace("/sign-in");
            })
          }
        />
        <Button
          outline
          title="Sign out every device"
          disabled={task.busy || !current}
          onPress={() =>
            Alert.alert(
              "Sign out every device?",
              "Your password will stay the same. All SoulNest sessions will be revoked.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Sign out all",
                  onPress: () =>
                    void task.run(async () => {
                      await api("auth/logout-all", "POST", {
                        password: current,
                      });
                      setCurrent("");
                      await auth.clearLocal();
                      router.replace("/sign-in");
                    }),
                },
              ],
            )
          }
        />
      </Card>
      <Card>
        <Body>Take your data with you</Body>
        <Body small>
          The export includes private conversations, memories and authorized
          photos. Choose a private destination in your phone’s share sheet.
        </Body>
        <Check value={confirmExport} onChange={setConfirmExport}>
          I understand this export contains my private data.
        </Check>
        <Button
          outline
          title="Export account data"
          disabled={task.busy || !confirmExport}
          onPress={() =>
            void task.run(async () => {
              if (!(await Sharing.isAvailableAsync()))
                throw Error("File sharing is unavailable on this device.");
              const data = await api("export");
              const file = new File(
                Paths.cache,
                "soulnest-private-export.json",
              );
              try {
                file.create({ overwrite: true });
                file.write(JSON.stringify(data, null, 2));
                await Sharing.shareAsync(file.uri, {
                  mimeType: "application/json",
                  UTI: "public.json",
                  dialogTitle: "Save your private SoulNest export",
                });
              } finally {
                if (file.exists) file.delete();
                setConfirmExport(false);
              }
            })
          }
        />
      </Card>
      <ErrorText error={task.error} />
    </>
  );
}
