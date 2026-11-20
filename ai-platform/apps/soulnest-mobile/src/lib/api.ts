import { Platform } from "react-native";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { resolveApiUrl } from "./domain";
const key = "soulnest.session.v1";
let token: string | null = null;
let previewAddress: string | undefined;
const serverKey = "soulnest.preview-api.v1";
export const previewConnectionEnabled = () =>
  __DEV__ || process.env.EXPO_PUBLIC_LOCAL_PREVIEW === "1";
let expiryHandler: () => void = () => {};
export function onExpired(handler: () => void) {
  expiryHandler = handler;
}
export function apiBase() {
  return resolveApiUrl(
    previewAddress ?? process.env.EXPO_PUBLIC_API_URL,
    __DEV__,
    process.env.EXPO_PUBLIC_LOCAL_PREVIEW === "1",
    Platform.OS === "android",
  );
}
export async function restoreToken() {
  if (previewConnectionEnabled()) {
    const saved = await SecureStore.getItemAsync(serverKey);
    if (saved) {
      try {
        previewAddress = resolveApiUrl(
          saved,
          __DEV__,
          true,
          Platform.OS === "android",
        );
      } catch {
        await clearToken();
        await SecureStore.deleteItemAsync(serverKey);
        previewAddress = undefined;
      }
    }
  }
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
  const sentToken = token;
  const response = await fetch(`${apiBase()}/${path}`, {
    method,
    credentials: "omit",
    headers: {
      "Content-Type": "application/json",
      ...(sentToken ? { Authorization: `Bearer ${sentToken}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(45000),
  });
  if (
    response.status === 401 &&
    sentToken === token &&
    !path.startsWith("auth/")
  ) {
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
  if (data.code === "EMAIL_REQUIRED") router.replace("/account-security");
  if (!response.ok)
    throw Error(data.error ?? "Could not complete the request.");
  return data;
}
export async function savePreviewConnection(value: string) {
  if (!previewConnectionEnabled())
    throw Error("Server selection is available only in development previews.");
  const address = resolveApiUrl(
    value,
    __DEV__,
    true,
    Platform.OS === "android",
  );
  const health = await fetch(address + "/health", {
    credentials: "omit",
    signal: AbortSignal.timeout(8000),
  });
  if (!health.ok || (await health.json()).status !== "ok")
    throw Error(
      "SoulNest is not responding at that address. Check that your trusted server is running.",
    );
  await clearToken();
  await SecureStore.setItemAsync(serverKey, address);
  previewAddress = address;
  expiryHandler();
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
