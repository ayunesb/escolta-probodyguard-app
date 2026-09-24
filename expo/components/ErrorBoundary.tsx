import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { RotateCcw } from "lucide-react-native";
import Colors from "@/constants/colors";
import { Space, Radius } from "@/constants/design";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { BrandMark } from "@/components/ui/Brand";
import { reportError } from "@/services/sentryService";
import i18n from "@/i18n";

// Vista de error compartida por el limite raiz y los de pantalla. No usa
// Screen ni safe-area: el limite raiz envuelve a SafeAreaProvider, asi que
// aqui no hay contexto del que depender.
export function ErrorFallbackView({
  title = i18n.t("common:errorBoundary.title"),
  message = i18n.t("common:errorBoundary.message"),
  error,
  primaryLabel = i18n.t("common:actions.tryAgain"),
  onPrimary,
  secondaryLabel,
  onSecondary,
}: {
  title?: string;
  message?: string;
  error?: Error | null;
  primaryLabel?: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <View style={styles.container} accessibilityRole="alert">
      <View style={styles.content}>
        <BrandMark size={52} color={Colors.accentDark} />
        <AppText variant="title2" align="center" style={styles.title}>
          {title}
        </AppText>
        <AppText variant="callout" align="center" style={styles.message}>
          {message}
        </AppText>
        {__DEV__ && error ? (
          <View style={styles.details}>
            <AppText variant="overline" color={Colors.textTertiary}>
              Dev only
            </AppText>
            <AppText variant="footnote" color={Colors.error} selectable>
              {error.message}
            </AppText>
          </View>
        ) : null}
        <View style={styles.actions}>
          <Button title={primaryLabel} icon={RotateCcw} onPress={onPrimary} />
          {secondaryLabel && onSecondary ? <Button title={secondaryLabel} variant="secondary" onPress={onSecondary} /> : null}
        </View>
      </View>
    </View>
  );
}

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] App crashed:", error, info?.componentStack);
    try {
      reportError(error, { componentStack: info?.componentStack });
    } catch {
      // el reporte nunca debe tumbar la pantalla de error
    }
  }

  // En web se recarga la pagina. En iOS/Android no existe window.location
  // (antes el boton lanzaba ahi mismo): se vuelve a montar el arbol.
  handleRetry = () => {
    if (Platform.OS === "web" && typeof window !== "undefined" && window.location) {
      window.location.reload();
      return;
    }
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return <ErrorFallbackView error={this.state.error} onPrimary={this.handleRetry} />;
    }
    return this.props.children;
  }
}

export { AppErrorBoundary as RorkErrorBoundary };

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Space.xxl,
    backgroundColor: Colors.background,
  },
  content: {
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
  },
  title: {
    marginTop: Space.xl,
  },
  message: {
    marginTop: Space.sm,
  },
  details: {
    alignSelf: "stretch",
    marginTop: Space.xl,
    padding: Space.md,
    gap: Space.xs,
    borderRadius: Radius.sm,
    backgroundColor: Colors.errorSoft,
  },
  actions: {
    alignSelf: "stretch",
    marginTop: Space.xxl,
    gap: Space.sm,
  },
});
