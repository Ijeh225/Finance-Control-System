import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, router, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { setBaseUrl } from "@workspace/api-client-react";
import { UserProvider } from "@/context/UserContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { UploadQueueProvider } from "@/context/UploadQueueContext";

// Set base URL for API calls
setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === "login";

    if (!user && !inAuthGroup) {
      router.replace("/login");
    } else if (user && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [user, isLoading, segments]);

  // Hold all app routes until the session check completes to prevent flash of
  // authenticated content for unauthenticated users.
  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0A0F1E", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#C9A84C" size="large" />
      </View>
    );
  }

  return <>{children}</>;
}

function RootLayoutNav() {
  return (
    <AuthGate>
      <Stack
        screenOptions={{
          headerBackTitle: "Back",
          headerStyle: { backgroundColor: "#0A0F1E" },
          headerTintColor: "#C9A84C",
          headerTitleStyle: { fontWeight: "bold" },
        }}
      >
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="scheduled-today" options={{ title: "Scheduled Today" }} />
        <Stack.Screen name="scheduled-tomorrow" options={{ title: "Tomorrow" }} />
        <Stack.Screen name="pending-approvals" options={{ title: "Pending Approvals" }} />
        <Stack.Screen name="overdue" options={{ title: "Overdue Bills" }} />
        <Stack.Screen name="outstanding" options={{ title: "Outstanding" }} />
        <Stack.Screen name="bill/[id]" options={{ title: "Bill Detail" }} />
        <Stack.Screen name="vendor/[id]" options={{ title: "Vendor Profile" }} />
        <Stack.Screen name="wallet/[id]" options={{ title: "Wallet Detail" }} />
      </Stack>
    </AuthGate>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <UserProvider>
          <ErrorBoundary>
            <QueryClientProvider client={queryClient}>
              <UploadQueueProvider>
                <GestureHandlerRootView>
                  <KeyboardProvider>
                    <RootLayoutNav />
                  </KeyboardProvider>
                </GestureHandlerRootView>
              </UploadQueueProvider>
            </QueryClientProvider>
          </ErrorBoundary>
        </UserProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
