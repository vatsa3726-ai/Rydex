import type { ExpoConfig, ConfigContext } from "expo/config";
export default ({ config }: ConfigContext): ExpoConfig => {
  const profile = process.env.EAS_BUILD_PROFILE ?? "development";
  const localPreview = process.env.EXPO_PUBLIC_LOCAL_PREVIEW === "1";
  const api = process.env.EXPO_PUBLIC_API_URL;
  if (
    ["preview", "production"].includes(profile) &&
    (!api || !api.startsWith("https://"))
  )
    throw Error(
      "Set EXPO_PUBLIC_API_URL to the deployed HTTPS API before creating a distributable build.",
    );
  return {
    ...config,
    name: localPreview ? "SoulNest Preview" : "SoulNest",
    slug: "soulnest",
    platforms: ["android", "ios"],
    version: "0.2.0",
    orientation: "portrait",
    scheme: "soulnest",
    userInterfaceStyle: "light",
    icon: "./assets/icon.png",
    ios: {
      bundleIdentifier:
        "com.hpsvinfratech.soulnest" + (localPreview ? ".preview" : ""),
      supportsTablet: true,
      config: { usesNonExemptEncryption: false },
    },
    android: {
      package: "com.hpsvinfratech.soulnest" + (localPreview ? ".preview" : ""),
      allowBackup: false,
      adaptiveIcon: {
        foregroundImage: "./assets/icon.png",
        backgroundColor: "#F7F5EE",
      },
      blockedPermissions: [
        "android.permission.READ_MEDIA_IMAGES",
        "android.permission.READ_MEDIA_VIDEO",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
      ],
    },
    plugins: [
      "expo-status-bar",
      "expo-router",
      "expo-secure-store",
      [
        "expo-image-picker",
        {
          photosPermission:
            "Choose an authorized photo for your private AI companion.",
          cameraPermission: false,
          microphonePermission: false,
        },
      ],
      [
        "expo-audio",
        {
          microphonePermission:
            "Record a message to transcribe for your AI conversation.",
          enableBackgroundPlayback: false,
          enableBackgroundRecording: false,
        },
      ],
      "expo-notifications",
      [
        "expo-build-properties",
        {
          android: {
            usesCleartextTraffic: localPreview || profile === "development",
          },
        },
      ],
    ],
    experiments: { typedRoutes: true },
    extra: {
      company: "HPSV Infra Tech LLP",
      ...(process.env.EAS_PROJECT_ID
        ? { eas: { projectId: process.env.EAS_PROJECT_ID } }
        : {}),
    },
  };
};
