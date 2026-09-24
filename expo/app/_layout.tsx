import React, { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { Platform, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Geist_400Regular } from "@expo-google-fonts/geist/400Regular";
import { Geist_500Medium } from "@expo-google-fonts/geist/500Medium";
import { Geist_600SemiBold } from "@expo-google-fonts/geist/600SemiBold";
import { Geist_700Bold } from "@expo-google-fonts/geist/700Bold";
import { EncodeSansExpanded_300Light } from "@expo-google-fonts/encode-sans-expanded/300Light";
import { EncodeSansExpanded_600SemiBold } from "@expo-google-fonts/encode-sans-expanded/600SemiBold";
import { EncodeSansExpanded_700Bold } from "@expo-google-fonts/encode-sans-expanded/700Bold";
import { EncodeSansExpanded_800ExtraBold } from "@expo-google-fonts/encode-sans-expanded/800ExtraBold";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { LocationTrackingProvider } from "@/contexts/LocationTrackingContext";
import { RorkErrorBoundary as RootErrorBoundary } from "@/components/ErrorBoundary";
import { AlertHost, BrandMark } from "@/components/ui";
import { initSentry } from "@/services/sentryService";
import { analyticsService } from "@/services/analyticsService";
import { appCheckService } from "@/services/appCheckService";
import { initializeFirebaseServices } from "@/lib/firebase";
import { installAlertWebPolyfill } from "@/utils/alertWebPolyfill";
import { hydrateLanguage } from "@/i18n";
import Colors from "@/constants/colors";

installAlertWebPolyfill();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60 * 5,
    },
  },
});

// Cuenta cada toque como actividad para el cierre por inactividad. Se usa la
// fase de captura y se devuelve false: observa el toque sin quitarselo al
// boton que lo recibe.
function ActivityBoundary({ children }: { children: React.ReactNode }) {
  const { markActivity } = useAuth();
  return (
    <View
      style={{ flex: 1 }}
      onStartShouldSetResponderCapture={() => {
        markActivity();
        return false;
      }}
    >
      {children}
    </View>
  );
}

export default function RootLayout() {
  const [firebaseReady, setFirebaseReady] = useState(false);
  // Las fuentes cargan en paralelo con Firebase. Si fallan, se sigue con las
  // del sistema: nunca bloquean la app.
  const [fontsLoaded, fontError] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    Geist_700Bold,
    EncodeSansExpanded_300Light,
    EncodeSansExpanded_600SemiBold,
    EncodeSansExpanded_700Bold,
    EncodeSansExpanded_800ExtraBold,
  });

  useEffect(() => {
    // Solo Firebase bloquea el primer render: el resto de pantallas lo usan.
    // Sentry, analitica y App Check van despues y sin esperar; antes eran una
    // cadena de awaits que retrasaba el arranque sin hacer nada util (las dos
    // ultimas son stubs).
    // El idioma guardado se lee a la par (AsyncStorage, milisegundos) para que
    // la primera pantalla ya salga en el idioma elegido.
    Promise.all([
      initializeFirebaseServices().catch((error) => console.error('[App] Firebase initialization error:', error)),
      hydrateLanguage(),
    ])
      .finally(() => {
        setFirebaseReady(true);
        initSentry();
        analyticsService.initialize().catch(() => {});
        if (Platform.OS !== 'web' || !__DEV__) {
          appCheckService.initialize().catch(() => {});
        }
      });
  }, []);

  if (!firebaseReady || (!fontsLoaded && !fontError)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background }}>
        <BrandMark size={64} />
      </View>
    );
  }

  return (
    <RootErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: Colors.background }}>
          <SafeAreaProvider>
            <StatusBar style="light" />
            <AuthProvider>
              <NotificationProvider>
                <LocationTrackingProvider>
                  <ActivityBoundary>
                  <Stack
                    screenOptions={{
                      headerShown: false,
                      contentStyle: { backgroundColor: Colors.background },
                      animation: 'fade_from_bottom',
                    }}
                  />
                  </ActivityBoundary>
                  <AlertHost />
                </LocationTrackingProvider>
              </NotificationProvider>
            </AuthProvider>
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </RootErrorBoundary>
  );
}
