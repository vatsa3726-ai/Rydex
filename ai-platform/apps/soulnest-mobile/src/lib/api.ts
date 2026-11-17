import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { resolveApiUrl } from "./domain";
const key = "soulnest.session.v1";
let token: string | null = null;
let expiryHandler: () => void = () => {};
export function onExpired(handler: () => void) {
  expiryHandler = handler;
}
export function apiBase() {
  return resolveApiUrl(
    process.env.EXPO_PUBLIC_API_URL,
    __DEV__,
    process.env.EXPO_PUBLIC_LOCAL_PREVIEW === "1",
    Platform.OS === "android",
  );
}
export async function restoreToken() {
  token = await SecureStore.getItemAsync(key);
  return token;
}
export async function saveToken(value: string) {
  await SecureStore.setItemAsync(key, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  token = value;
}
export async function clearToken() {
  token = null;
  await SecureStore.deleteItemAsync(key);
}
export function imageSource(id: string, version = 0) {
  return {
    uri: `${apiBase()}/companions/${id}/photo?v=${version}`,
    headers: { Authorization: `Bearer ${token ?? ""}` },
    cache: "reload" as const,
  };
}
export async function request(path: string, method = "GET", body?: unknown) {
  const response = await fetch(`${apiBase()}/${path}`, {
    method,
    credentials: "omit",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(45000),
  });
  if (response.status === 401 && !path.startsWith("auth/native/")) {
    try {
      await clearToken();
    } finally {
      expiryHandler();
    }
  }
  return response;
}
export async function api<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await request(path, method, body);
  let data: any;
  try {
    data = await response.json();
  } catch {
    throw Error(
      "The API did not return a valid response. Check the server connection.",
    );
  }
  if (!response.ok)
    throw Error(data.error ?? "Could not complete the request.");
  return data;
}
export async function revokeToken(value: string) {
  await fetch(`${apiBase()}/auth/logout`, {
    method: "POST",
    credentials: "omit",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${value}`,
    },
    body: "{}",
    signal: AbortSignal.timeout(5000),
  });
}
