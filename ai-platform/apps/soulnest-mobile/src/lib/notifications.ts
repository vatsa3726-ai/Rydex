import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
const key = "soulnest.reminder.v1";
export async function reminderEnabled() {
  const id = await SecureStore.getItemAsync(key);
  return Boolean(
    id &&
    (await Notifications.getAllScheduledNotificationsAsync()).some(
      (n) => n.identifier === id,
    ),
  );
}
export async function disableReminder() {
  const id = await SecureStore.getItemAsync(key);
  if (id) await Notifications.cancelScheduledNotificationAsync(id);
  await SecureStore.deleteItemAsync(key);
}
export async function enableReminder() {
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync("reflection", {
      name: "Reflection reminders",
      importance: Notifications.AndroidImportance.DEFAULT,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted)
    throw Error(
      "Notifications are off. You can allow them in your phone settings.",
    );
  await disableReminder();
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: "A moment for yourself",
      body: "Your space is here whenever you feel like reflecting.",
      sound: false,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 19,
      minute: 0,
      channelId: "reflection",
    },
  });
  await SecureStore.setItemAsync(key, id);
}
