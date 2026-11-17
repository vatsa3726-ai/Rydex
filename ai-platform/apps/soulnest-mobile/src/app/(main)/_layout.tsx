import { Tabs, Redirect } from "expo-router";
import { Text } from "react-native";
import { useAuth } from "../../lib/auth";
import { Loading, colors } from "../../components/ui";
export default function Main() {
  const { loading, user } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Redirect href="/sign-in" />;
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.ink,
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: colors.paper },
        tabBarActiveTintColor: colors.green,
      }}
    >
      <Tabs.Screen
        name="gallery"
        options={{
          title: "My space",
          tabBarIcon: () => (
            <Text style={{ fontSize: 23, color: colors.green }}>✧</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarIcon: () => (
            <Text style={{ fontSize: 22, color: colors.green }}>☰</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: () => (
            <Text style={{ fontSize: 25, color: colors.green }}>○</Text>
          ),
        }}
      />
    </Tabs>
  );
}
