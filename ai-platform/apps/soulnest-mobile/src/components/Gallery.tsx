import { useCallback, useState } from "react";
import { Image, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { api, imageSource } from "../lib/api";
import { type Companion, relationships, languages } from "../lib/domain";
import { useAuth } from "../lib/auth";
import {
  Screen,
  Title,
  Body,
  Button,
  Card,
  ErrorText,
  ui,
  useTask,
} from "./ui";
export function Gallery({ history = false }: { history?: boolean }) {
  const [companions, setCompanions] = useState<Companion[]>([]);
  const { user } = useAuth(),
    task = useTask();
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void api<{ companions: Companion[] }>("companions")
        .then((d) => {
          if (active) setCompanions(d.companions);
        })
        .catch((e) => {
          if (active) task.setError(e.message);
        });
      return () => {
        active = false;
      };
    }, []),
  );
  return (
    <Screen>
      <Title
        eyebrow={
          history ? "CONTINUE WHERE YOU LEFT OFF" : "YOUR KIND OF COMPANY"
        }
      >
        {history
          ? "Pick up the conversation."
          : `A moment for you, ${user?.name ?? "friend"}.`}
      </Title>
      <Body>
        {history
          ? "Open a companion to see your private conversation history."
          : "Choose a familiar style. Every companion is a fictional AI."}
      </Body>
      <ErrorText error={task.error} />
      <Button
        title="＋ Create a companion"
        onPress={() => router.push("/create")}
      />
      {companions.map((c, i) => (
        <Card key={c.id} tint={i % 2 === 0}>
          <View style={ui.row}>
            <View style={ui.avatar}>
              {c.has_photo ? (
                <Image
                  source={imageSource(c.id)}
                  style={{ width: 68, height: 68 }}
                  accessibilityLabel={`${c.name} AI avatar`}
                />
              ) : (
                <Text style={ui.h2}>{c.name[0]}</Text>
              )}
            </View>
            <View style={{ flex: 1, gap: 5 }}>
              <Text style={ui.h2}>{c.name}</Text>
              <Body small>
                AI ·{" "}
                {relationships.find(([key]) => key === c.relationship)?.[1] ??
                  c.custom_label}{" "}
                · {languages.find(([key]) => key === c.language)?.[1]}
              </Body>
            </View>
          </View>
          <Body small>
            {c.personality} · {c.tone}
          </Body>
          <Button
            title={history ? "Open saved conversation" : "Let’s talk ↗"}
            onPress={() =>
              router.push({ pathname: "/chat/[id]", params: { id: c.id } })
            }
          />
          <Button
            outline
            title="Photo, personality & memories"
            onPress={() =>
              router.push({ pathname: "/companion/[id]", params: { id: c.id } })
            }
          />
        </Card>
      ))}
      {companions.length === 0 && (
        <Card>
          <Text style={ui.h2}>Who would you like to talk to?</Text>
          <Body>
            Create your first companion to begin. Your private conversations
            will appear here.
          </Body>
        </Card>
      )}
    </Screen>
  );
}
