import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Image, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { api, imageSource } from "../../lib/api";
import { Companion, type Memory } from "../../lib/domain";
import { choosePhoto, discardPhoto } from "../../lib/photos";
import { CompanionWizard } from "../../components/CompanionWizard";
import {
  Body,
  Button,
  Card,
  Check,
  ErrorText,
  Field,
  Loading,
  RequireUser,
  Screen,
  Title,
  ui,
  useTask,
} from "../../components/ui";
function Details() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [c, setC] = useState<Companion | null>(null),
    [notes, setNotes] = useState<Memory[]>([]),
    [enabled, setEnabled] = useState(false),
    [note, setNote] = useState(""),
    [editing, setEditing] = useState(""),
    [editProfile, setEditProfile] = useState(false),
    [version, setVersion] = useState(0);
  const task = useTask();
  async function refresh() {
    const [profile, memory] = await Promise.all([
      api<{ companion: Companion }>(`companions/${id}`),
      api<{ enabled: boolean; memories: Memory[] }>(
        `companions/${id}/memories`,
      ),
    ]);
    setC(profile.companion);
    setEnabled(memory.enabled);
    setNotes(memory.memories);
  }
  useFocusEffect(
    useCallback(() => {
      void task.run(refresh);
    }, [id]),
  );
  if (editProfile && c) return <CompanionWizard existing={c} />;
  if (!c)
    return (
      <Screen>
        <Title>Your companion</Title>
        <ErrorText error={task.error} />
        <Button title="Try again" onPress={() => void task.run(refresh)} />
      </Screen>
    );
  return (
    <Screen>
      <Title eyebrow="PRIVATE COMPANION SETTINGS">{c.name} · AI</Title>
      <Body>
        Fictional AI · {c.relationship} style. Always a simulation, never the
        person in a photo.
      </Body>
      {c.has_photo && (
        <Image
          source={imageSource(id, version)}
          style={{ width: 120, height: 120, borderRadius: 60 }}
          accessibilityLabel="Private authorized AI avatar"
        />
      )}
      <Button
        title="Edit name, language & personality"
        outline
        onPress={() => setEditProfile(true)}
      />
      <Card>
        <Text style={ui.h2}>A familiar face</Text>
        <Body small>
          Choose only a photo you own or have permission to use. It stays
          private and is never sent to the chat model.
        </Body>
        <Button
          title="Choose an authorized photo"
          disabled={task.busy}
          outline
          onPress={() =>
            Alert.alert(
              "Permission to use this likeness",
              "Confirm you own the photo or have permission to use this person’s likeness in a private AI simulation.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "I have permission",
                  onPress: () =>
                    void task.run(async () => {
                      const photo = await choosePhoto();
                      if (!photo) return;
                      try {
                        await api(`companions/${id}/photo`, "PUT", {
                          base64: photo.base64,
                          authorized: true,
                        });
                        setVersion((v) => v + 1);
                        await refresh();
                      } finally {
                        discardPhoto(photo);
                      }
                    }),
                },
              ],
            )
          }
        />
        {c.has_photo && (
          <Button
            title="Remove photo"
            disabled={task.busy}
            outline
            onPress={() =>
              void task.run(async () => {
                await api(`companions/${id}/photo`, "DELETE", {});
                await refresh();
              })
            }
          />
        )}
      </Card>
      <Card>
        <Text style={ui.h2}>Memory, by permission</Text>
        <Body small>
          Only notes you explicitly save become long-term memory. Enabled notes
          go to the configured AI provider with future messages.
        </Body>
        <Check
          value={enabled}
          onChange={(value) => {
            if (task.busy) return;
            if (!value)
              Alert.alert(
                "Forget all saved notes?",
                "Turning memory off permanently deletes these notes. Chat history is separate.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Turn off & forget",
                    style: "destructive",
                    onPress: () =>
                      void task.run(async () => {
                        await api(`companions/${id}/memory-consent`, "PUT", {
                          enabled: false,
                        });
                        setEditing("");
                        setNote("");
                        await refresh();
                      }),
                  },
                ],
              );
            else
              void task.run(async () => {
                await api(`companions/${id}/memory-consent`, "PUT", {
                  enabled: true,
                });
                await refresh();
              });
          }}
        >
          Allow saved memories
        </Check>
        {enabled && (
          <>
            {notes.map((n) => (
              <View key={n.id} style={{ gap: 10, paddingVertical: 12 }}>
                <Body>{n.text}</Body>
                <View style={ui.row}>
                  <Button
                    outline
                    title="Edit note"
                    disabled={task.busy}
                    onPress={() => {
                      setEditing(n.id);
                      setNote(n.text);
                    }}
                  />
                  <Button
                    outline
                    title="Forget note"
                    disabled={task.busy}
                    onPress={() =>
                      void task.run(async () => {
                        await api(
                          `companions/${id}/memories/${n.id}`,
                          "DELETE",
                          {},
                        );
                        if (editing === n.id) {
                          setNote("");
                          setEditing("");
                        }
                        await refresh();
                      })
                    }
                  />
                </View>
              </View>
            ))}
            <Field
              label={editing ? "Edit saved note" : "A note to remember"}
              value={note}
              onChangeText={setNote}
              multiline
              maxLength={500}
            />
            <Button
              title={editing ? "Save changes" : "Save this note"}
              disabled={task.busy || !note.trim()}
              onPress={() =>
                void task.run(async () => {
                  await api(
                    `companions/${id}/memories${editing ? "/" + editing : ""}`,
                    editing ? "PUT" : "POST",
                    { text: note.trim() },
                  );
                  setEditing("");
                  setNote("");
                  await refresh();
                })
              }
            />
            {editing && (
              <Button
                title="Cancel editing"
                outline
                onPress={() => {
                  setNote("");
                  setEditing("");
                }}
              />
            )}
          </>
        )}
        <Body small>
          Turning memory off does not remove copies typed in chat history. A
          reply already being generated may have received earlier notes.
        </Body>
      </Card>
      <Card>
        <Text style={ui.h2}>A fresh chapter</Text>
        <Body small>
          Clear all messages in this conversation. Separately saved memories
          stay until you forget or disable them.
        </Body>
        <Button
          outline
          title="Clear conversation history"
          disabled={task.busy}
          onPress={() =>
            Alert.alert(
              "Clear this conversation?",
              "This permanently deletes the saved chat messages.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Clear history",
                  style: "destructive",
                  onPress: () =>
                    void task.run(async () => {
                      await api(`companions/${id}/messages`, "DELETE", {});
                      Alert.alert("Conversation cleared");
                    }),
                },
              ],
            )
          }
        />
        <Button
          danger
          title="Delete companion permanently"
          disabled={task.busy}
          onPress={() =>
            Alert.alert(
              `Delete ${c.name}?`,
              "This removes the companion, photo references, messages and saved notes. Object files are queued for private storage cleanup.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete companion",
                  style: "destructive",
                  onPress: () =>
                    void task.run(async () => {
                      await api(`companions/${id}`, "DELETE", {});
                      router.replace("/gallery");
                    }),
                },
              ],
            )
          }
        />
      </Card>
      <ErrorText error={task.error} />
    </Screen>
  );
}
export default function CompanionSettings() {
  return (
    <RequireUser>
      <Details />
    </RequireUser>
  );
}
