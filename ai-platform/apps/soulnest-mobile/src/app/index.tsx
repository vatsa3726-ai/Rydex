import { previewConnectionEnabled } from "../lib/api";
import { View, Text } from "react-native";
import { Redirect, router } from "expo-router";
import { useAuth } from "../lib/auth";
import {
  Body,
  Button,
  Card,
  Screen,
  Title,
  ui,
  Loading,
  colors,
} from "../components/ui";
export default function Welcome() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (user) return <Redirect href="/gallery" />;
  return (
    <Screen>
      <View style={{ paddingTop: 45, gap: 28 }}>
        <Text style={[ui.h2, { fontSize: 30 }]}>SoulNest ✧</Text>
        <View
          style={{
            height: 190,
            borderTopLeftRadius: 100,
            borderTopRightRadius: 100,
            borderBottomLeftRadius: 28,
            borderBottomRightRadius: 28,
            backgroundColor: colors.sage,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 86, color: "#AD7E50" }}>✧</Text>
          <Body small>A moment to pause. A place to begin.</Body>
        </View>
        <Title eyebrow="A LITTLE SPACE TO FEEL HEARD">
          A familiar warmth.{"\n"}A little more you.
        </Title>
        <Body>
          Create an AI companion who listens, encourages and helps you
          reflect—in your own language.
        </Body>
        <Card>
          <Body small>
            Always a fictional AI. Never the person in a photo, a real relative
            or a replacement for human connection. For adults 18+.
          </Body>
        </Card>
        <Button
          title="Make yourself at home"
          onPress={() =>
            router.push({ pathname: "/sign-in", params: { mode: "register" } })
          }
        />
        <Button
          title="I already have an account"
          outline
          onPress={() => router.push("/sign-in")}
        />
        <Button
          title="Privacy & companion terms"
          outline
          onPress={() => router.push("/privacy")}
        />
        {previewConnectionEnabled() && (
          <Button
            outline
            title="Connect this preview to my server"
            onPress={() => router.push("/connection")}
          />
        )}
        <Body small>HPSV Infra Tech LLP</Body>
      </View>
    </Screen>
  );
}
