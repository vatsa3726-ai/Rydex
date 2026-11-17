import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "../lib/auth";
import { colors } from "../components/ui";
export default function Layout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.ink,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
          headerTitle: "SoulNest",
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(main)" options={{ headerShown: false }} />
        <Stack.Screen
          name="sign-in"
          options={{ title: "Welcome to SoulNest" }}
        />
        <Stack.Screen
          name="create"
          options={{ title: "Create your companion" }}
        />
        <Stack.Screen
          name="chat/[id]"
          options={{ title: "Your conversation" }}
        />
        <Stack.Screen
          name="call/[id]"
          options={{ title: "AI voice conversation" }}
        />
        <Stack.Screen
          name="companion/[id]"
          options={{ title: "Companion & memory" }}
        />
        <Stack.Screen name="privacy" options={{ title: "Your privacy" }} />
      </Stack>
    </AuthProvider>
  );
}
