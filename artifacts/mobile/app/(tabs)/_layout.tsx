import { Tabs, usePathname } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Platform, StyleSheet, View } from "react-native";
import * as Notifications from "expo-notifications";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { useListNotifications, getListNotificationsQueryKey } from "@workspace/api-client-react";

export default function TabLayout() {
  const colors = useColors();
  const { user } = useAuth();
  const isWeb = Platform.OS === "web";
  const isMd = user?.role === "md";
  const userId = user?.id ?? "";
  const pathname = usePathname();
  const isAlertsFocused = pathname === "/alerts" || pathname.endsWith("/alerts");
  const permissionGranted = useRef<boolean | null>(null);

  const { data: notifData } = useListNotifications(
    { userId },
    { query: { enabled: !!userId, queryKey: getListNotificationsQueryKey({ userId }), refetchInterval: 30_000 } }
  );
  const unreadCount = notifData?.unreadCount ?? 0;

  // Request notification permission once on mount (native only).
  useEffect(() => {
    if (isWeb) return;
    (async () => {
      const { status } = await Notifications.getPermissionsAsync();
      if (status === "granted") {
        permissionGranted.current = true;
      } else {
        const { status: newStatus } = await Notifications.requestPermissionsAsync();
        permissionGranted.current = newStatus === "granted";
      }
    })().catch(() => {});
  }, [isWeb]);

  // Sync badge count with unread count whenever it changes, but not while
  // the Alerts tab is open (alerts.tsx clears it to 0 on focus).
  useEffect(() => {
    if (isWeb || isAlertsFocused) return;
    (async () => {
      // Lazy-resolve permission if the mount effect hasn't finished yet.
      if (permissionGranted.current === null) {
        const { status } = await Notifications.getPermissionsAsync();
        permissionGranted.current = status === "granted";
      }
      if (permissionGranted.current) {
        await Notifications.setBadgeCountAsync(unreadCount);
      }
    })().catch(() => {});
  }, [unreadCount, isWeb, isAlertsFocused]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 0,
          height: isWeb ? 84 : 60,
          paddingBottom: isWeb ? 34 : 8,
          paddingTop: 8,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <Feather name="home" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="bills"
        options={{
          title: "Bills",
          tabBarIcon: ({ color }) => <Feather name="file-text" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="vendors"
        options={{
          title: "Vendors",
          tabBarIcon: ({ color }) => <Feather name="users" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="wallets"
        options={{
          title: "Wallets",
          tabBarIcon: ({ color }) => <Feather name="credit-card" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: "Alerts",
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarIcon: ({ color }) => (
            <View>
              <Feather name="bell" size={24} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: "Reports",
          tabBarIcon: ({ color }) => <Feather name="bar-chart-2" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="audit"
        options={{
          title: "Audit",
          href: isMd ? undefined : null,
          tabBarIcon: ({ color }) => <Feather name="shield" size={24} color={color} />,
        }}
      />
    </Tabs>
  );
}
