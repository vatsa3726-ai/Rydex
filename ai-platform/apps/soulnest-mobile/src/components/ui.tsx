import React, { useState, useRef } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect } from "expo-router";
import { useAuth } from "../lib/auth";
export const colors = {
  bg: "#F7F5EE",
  ink: "#264739",
  muted: "#68776A",
  green: "#315B47",
  line: "#D9DFD2",
  paper: "#FFFDF7",
  sage: "#E7ECD9",
  rose: "#F2E5DA",
  error: "#963D2D",
};
export const ui = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 24, gap: 20, paddingBottom: 44 },
  title: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 36,
    lineHeight: 43,
    color: colors.ink,
  },
  h2: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 24,
    color: colors.ink,
  },
  body: { fontSize: 16, lineHeight: 25, color: colors.ink },
  small: { fontSize: 13, lineHeight: 20, color: colors.muted },
  eyebrow: { fontSize: 11, letterSpacing: 2, color: colors.muted },
  card: {
    padding: 22,
    borderRadius: 24,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    padding: 15,
    color: colors.ink,
    backgroundColor: colors.paper,
    fontSize: 16,
    minHeight: 52,
  },
  button: {
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingVertical: 15,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.green,
  },
  buttonText: { fontSize: 15, fontWeight: "600", color: "#FFFDF6" },
  outline: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "transparent",
  },
  choice: {
    minHeight: 46,
    padding: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 18,
    backgroundColor: colors.paper,
  },
  selected: { backgroundColor: colors.sage, borderColor: colors.green },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.sage,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});
export function Screen({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={ui.page} edges={["left", "right", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={ui.content}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function Title({
  eyebrow,
  children,
}: {
  eyebrow?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 12 }}>
      {eyebrow && <Text style={ui.eyebrow}>{eyebrow}</Text>}
      <Text accessibilityRole="header" style={ui.title}>
        {children}
      </Text>
    </View>
  );
}
export function Body({
  children,
  small = false,
}: {
  children: React.ReactNode;
  small?: boolean;
}) {
  return <Text style={small ? ui.small : ui.body}>{children}</Text>;
}
export function Card({
  children,
  tint = false,
}: {
  children: React.ReactNode;
  tint?: boolean;
}) {
  return (
    <View style={[ui.card, tint && { backgroundColor: colors.sage }]}>
      {children}
    </View>
  );
}
export function Button({
  title,
  onPress,
  disabled = false,
  outline = false,
  danger = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  outline?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        ui.button,
        outline && ui.outline,
        danger && { backgroundColor: colors.error },
        (disabled || pressed) && { opacity: 0.55 },
      ]}
    >
      <Text style={[ui.buttonText, outline && { color: colors.ink }]}>
        {title}
      </Text>
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={ui.small}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        {...props}
        style={[
          ui.input,
          props.multiline && { minHeight: 100, textAlignVertical: "top" },
          props.style,
        ]}
      />
    </View>
  );
}
export function Choices({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: readonly (readonly [string, string])[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={{ gap: 10 }}>
      <Text style={ui.small}>{label}</Text>
      <View style={ui.row}>
        {items.map(([key, name]) => (
          <Pressable
            key={key}
            accessibilityRole="radio"
            accessibilityState={{ selected: key === value }}
            onPress={() => onChange(key)}
            style={[ui.choice, key === value && ui.selected]}
          >
            <Text style={{ color: colors.ink }}>{name}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
export function Check({
  value,
  onChange,
  children,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={[ui.row, { alignItems: "flex-start", paddingVertical: 8 }]}
    >
      <Text style={{ fontSize: 24, color: colors.green }}>
        {value ? "☑" : "☐"}
      </Text>
      <View style={{ flex: 1 }}>
        <Body small>{children}</Body>
      </View>
    </Pressable>
  );
}
export function ErrorText({ error }: { error: string }) {
  return error ? (
    <Text
      accessibilityRole="alert"
      style={{ color: colors.error, lineHeight: 22 }}
    >
      {error}
    </Text>
  ) : null;
}
export function Loading() {
  return (
    <View style={[ui.page, { padding: 40, gap: 15 }]}>
      <ActivityIndicator color={colors.green} />
      <Body>Opening your space…</Body>
    </View>
  );
}
export function RequireUser({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Redirect href="/sign-in" />;
  return <>{children}</>;
}
export function useTask() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function run(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { busy, error, setError, run };
}
