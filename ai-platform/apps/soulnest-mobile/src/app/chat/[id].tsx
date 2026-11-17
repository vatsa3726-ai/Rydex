import { useCallback, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Crypto from "expo-crypto";
import { api } from "../../lib/api";
import { type Companion, type Message } from "../../lib/domain";
import {
  Body,
  Button,
  ErrorText,
  RequireUser,
  ui,
  colors,
  useTask,
} from "../../components/ui";
function Conversation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [companion, setCompanion] = useState<Companion | null>(null),
    [messages, setMessages] = useState<Message[]>([]),
    [draft, setDraft] = useState(""),
    [more, setMore] = useState(false),
    [mode, setMode] = useState("preview");
  const pending = useRef<{ id: string; text: string } | null>(null),
    list = useRef<FlatList<Message>>(null);
  const task = useTask();
  async function refresh() {
    const data = await api<{
      messages: Message[];
      hasMore: boolean;
      mode: string;
    }>(`companions/${id}/messages`);
    setMessages(data.messages);
    setMore(data.hasMore);
    setMode(data.mode);
  }
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void Promise.all([
        api<{ companion: Companion }>(`companions/${id}`),
        api<{ messages: Message[]; hasMore: boolean; mode: string }>(
          `companions/${id}/messages`,
        ),
      ])
        .then(([c, m]) => {
          if (active) {
            setCompanion(c.companion);
            setMessages(m.messages);
            setMore(m.hasMore);
            setMode(m.mode);
          }
        })
        .catch((e) => {
          if (active) task.setError(e.message);
        });
      return () => {
        active = false;
      };
    }, [id]),
  );
  async function send() {
    if (!draft.trim()) return;
    if (pending.current?.text !== draft.trim())
      pending.current = { id: Crypto.randomUUID(), text: draft.trim() };
    await api(`companions/${id}/chat`, "POST", {
      content: pending.current.text,
      requestId: pending.current.id,
    });
    await refresh();
    setDraft("");
    pending.current = null;
    setTimeout(() => list.current?.scrollToEnd({ animated: true }), 100);
  }
  return (
    <SafeAreaView style={ui.page} edges={["left", "right", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={95}
      >
        <View
          style={{
            padding: 20,
            gap: 12,
            borderBottomWidth: 1,
            borderColor: colors.line,
          }}
        >
          <Text style={ui.h2}>{companion?.name ?? "Your companion"}</Text>
          <Body small>
            Fictional AI · {companion?.relationship ?? "companion"} style
          </Body>
          <View style={ui.row}>
            <Button
              outline
              title="AI voice"
              disabled={task.busy || !companion}
              onPress={() =>
                router.push({ pathname: "/call/[id]", params: { id } })
              }
            />
            <Button
              outline
              title="Photo & memory"
              disabled={task.busy || !companion}
              onPress={() =>
                router.push({ pathname: "/companion/[id]", params: { id } })
              }
            />
          </View>
          <Body small>
            {mode === "preview"
              ? "Preview replies: no live AI model is configured."
              : "AI-generated replies. Recent messages and enabled notes are shared with the configured provider."}
          </Body>
        </View>
        <FlatList
          ref={list}
          data={messages}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 20, gap: 12, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            more ? (
              <Button
                outline
                title="Load earlier messages"
                disabled={task.busy}
                onPress={() =>
                  void task.run(async () => {
                    const data = await api<{
                      messages: Message[];
                      hasMore: boolean;
                    }>(`companions/${id}/messages?before=${messages[0].id}`);
                    setMessages([...data.messages, ...messages]);
                    setMore(data.hasMore);
                  })
                }
              />
            ) : undefined
          }
          ListEmptyComponent={
            <Body>Take your time. What would you like to talk about?</Body>
          }
          renderItem={({ item }) => (
            <View
              style={{
                maxWidth: "90%",
                alignSelf: item.role === "user" ? "flex-end" : "flex-start",
                padding: 16,
                borderRadius: 20,
                backgroundColor:
                  item.role === "user" ? colors.green : colors.sage,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  color: item.role === "user" ? "#E7ECD9" : colors.muted,
                }}
              >
                {item.role === "user"
                  ? "You"
                  : `${companion?.name ?? "Companion"} · AI`}
              </Text>
              <Text
                selectable
                style={{
                  fontSize: 16,
                  lineHeight: 25,
                  color: item.role === "user" ? "white" : colors.ink,
                  marginTop: 6,
                }}
              >
                {item.content}
              </Text>
            </View>
          )}
        />
        <View
          style={{
            padding: 18,
            gap: 10,
            borderTopWidth: 1,
            borderColor: colors.line,
          }}
        >
          <ErrorText error={task.error} />
          {task.busy && <Body small>One moment…</Body>}
          <TextInput
            accessibilityLabel="Your message"
            style={[ui.input, { maxHeight: 130 }]}
            placeholder="What’s on your mind?"
            placeholderTextColor={colors.muted}
            multiline
            value={draft}
            maxLength={2000}
            onChangeText={setDraft}
            editable={!task.busy}
          />
          <Button
            title={task.busy ? "Waiting for a reply…" : "Send ↗"}
            disabled={task.busy || !draft.trim() || !companion}
            onPress={() => void task.run(send)}
          />
          <Body small>
            History is private and saved on your account. Delete it in companion
            settings.
          </Body>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export default function Chat() {
  return (
    <RequireUser>
      <Conversation />
    </RequireUser>
  );
}
