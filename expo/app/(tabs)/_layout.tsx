import React, { useEffect, useRef } from "react";
import { Animated, Platform, StyleSheet, View } from "react-native";
import { Tabs, Redirect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Shield,
  CalendarDays,
  UserRound,
  BriefcaseBusiness,
  LayoutDashboard,
  Users as UsersIcon,
  FileCheck2,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import Colors from "@/constants/colors";
import { Fonts, Motion } from "@/constants/design";
import { AppText, PressableScale } from "@/components/ui";
import type { UserRole } from "@/types";

type TabName = "home" | "bookings" | "profile" | "company-home" | "company-guards" | "admin-home" | "admin-kyc" | "admin-users";
type TabKey = keyof ReturnType<typeof useTabTitles>;
type TabSpec = { name: TabName; title: TabKey; icon: LucideIcon };
type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>["tabBar"]>>[0];

// Pestanas visibles por rol, en orden. Las demas se registran con href:null
// (ocultas) porque expo-router necesita declarar todas las rutas del grupo.
const TABS_BY_ROLE: Record<UserRole, TabSpec[]> = {
  client: [
    { name: "home", title: "protect", icon: Shield },
    { name: "bookings", title: "bookings", icon: CalendarDays },
    { name: "profile", title: "account", icon: UserRound },
  ],
  guard: [
    { name: "home", title: "jobs", icon: BriefcaseBusiness },
    { name: "bookings", title: "history", icon: CalendarDays },
    { name: "profile", title: "account", icon: UserRound },
  ],
  company: [
    { name: "company-home", title: "overview", icon: LayoutDashboard },
    { name: "company-guards", title: "roster", icon: Shield },
    { name: "bookings", title: "bookings", icon: CalendarDays },
    { name: "profile", title: "account", icon: UserRound },
  ],
  admin: [
    { name: "admin-home", title: "overview", icon: LayoutDashboard },
    { name: "admin-kyc", title: "verification", icon: FileCheck2 },
    { name: "admin-users", title: "members", icon: UsersIcon },
    { name: "bookings", title: "bookings", icon: CalendarDays },
    { name: "profile", title: "account", icon: UserRound },
  ],
};

const ALL_TABS: TabName[] = ["home", "bookings", "profile", "company-home", "company-guards", "admin-home", "admin-kyc", "admin-users"];

function useTabTitles() {
  const { t } = useTranslation("nav");
  return {
    protect: t("tabs.protect"),
    bookings: t("tabs.bookings"),
    account: t("tabs.account"),
    jobs: t("tabs.jobs"),
    history: t("tabs.history"),
    overview: t("tabs.overview"),
    roster: t("tabs.roster"),
    verification: t("tabs.verification"),
    members: t("tabs.members"),
  };
}

// Medidas del dock. Todo sale de aqui para que la pastilla del icono y la
// etiqueta nunca se toquen (antes el alto lo repartia la barra por defecto y
// la etiqueta quedaba pegada a la pastilla y recortada por abajo).
const DOCK = {
  padY: 9,
  pillW: 52,
  pillH: 32,
  gap: 4,
  // Geist tiene descendentes largos: con 11px necesita 16 de linea o la "g" se recorta.
  labelLine: 16,
};
const DOCK_HEIGHT = DOCK.padY * 2 + DOCK.pillH + DOCK.gap + DOCK.labelLine; // 70

function DockItem({ icon: Icon, label, focused, onPress, onLongPress }: {
  icon: LucideIcon;
  label: string;
  focused: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  // La pastilla aparece con un muelle corto; solo opacidad y escala.
  const on = useRef(new Animated.Value(focused ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(on, { toValue: focused ? 1 : 0, useNativeDriver: Platform.OS !== "web", ...Motion.spring }).start();
  }, [focused, on]);

  return (
    <PressableScale
      onPress={onPress}
      onLongPress={onLongPress}
      scaleTo={0.92}
      haptic={focused ? false : "selection"}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      hoverStyle={focused ? undefined : styles.itemHover}
      style={styles.item}
    >
      <View style={styles.pill}>
        <Animated.View
          pointerEvents="none"
          style={[styles.pillBg, { opacity: on, transform: [{ scale: on.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] }]}
        />
        {/* El icono va en su propia vista: en web lo absoluto se pinta sobre lo
            estatico y la pastilla blanca tapaba el icono. */}
        <View style={styles.pillIcon}>
          <Icon size={20} color={focused ? Colors.textOnAccent : Colors.textTertiary} strokeWidth={focused ? 2 : 1.6} />
        </View>
      </View>
      <AppText
        numberOfLines={1}
        style={[styles.label, focused ? styles.labelOn : null]}
        color={focused ? Colors.textPrimary : Colors.textTertiary}
      >
        {label}
      </AppText>
    </PressableScale>
  );
}

function FloatingDock({ state, navigation, tabs, bottom }: TabBarProps & { tabs: TabSpec[]; bottom: number }) {
  const titles = useTabTitles();
  const focusedName = state.routes[state.index]?.name;
  return (
    <View pointerEvents="box-none" style={[styles.dockWrap, { bottom }]}>
      <View style={styles.dock} accessibilityRole="tablist">
        {tabs.map((tab) => {
          const route = state.routes.find((r) => r.name === tab.name);
          if (!route) return null;
          const focused = focusedName === tab.name;
          const onPress = () => {
            const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };
          const onLongPress = () => navigation.emit({ type: "tabLongPress", target: route.key });
          return (
            <DockItem
              key={tab.name}
              icon={tab.icon}
              label={titles[tab.title]}
              focused={focused}
              onPress={onPress}
              onLongPress={onLongPress}
            />
          );
        })}
      </View>
    </View>
  );
}

export default function TabLayout() {
  const { user, isLoading } = useAuth();
  const insets = useSafeAreaInsets();
  const titles = useTabTitles();

  if (isLoading) return <View style={styles.blank} />;
  if (!user) return <Redirect href="/auth/sign-in" />;

  const visible = TABS_BY_ROLE[user.role];
  if (!visible) return <Redirect href="/auth/sign-in" />;

  const hidden = ALL_TABS.filter((name) => !visible.some((t) => t.name === name));
  // Dock flotante: pastilla de vidrio separada de los bordes. Las pantallas
  // reservan su alto abajo (sceneStyle) para que nada quede tapado.
  const dockBottom = Math.max(insets.bottom, 12);

  return (
    <Tabs
      tabBar={(props) => <FloatingDock {...props} tabs={visible} bottom={dockBottom} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: Colors.background, paddingBottom: DOCK_HEIGHT + dockBottom + 10 },
      }}
    >
      {visible.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: titles[tab.title] }} />
      ))}
      {hidden.map((name) => (
        <Tabs.Screen key={name} name={name} options={{ href: null }} />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  blank: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  dockWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: 16,
  },
  dock: {
    width: "100%",
    maxWidth: 520,
    height: DOCK_HEIGHT,
    flexDirection: "row",
    alignItems: "stretch",
    paddingHorizontal: 6,
    borderRadius: DOCK_HEIGHT / 2,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    backgroundColor: "rgba(14, 21, 38, 0.92)",
    ...(Platform.OS === "web"
      ? ({ backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", boxShadow: "0 18px 40px rgba(0, 4, 16, 0.55)" } as object)
      : { shadowColor: "#000410", shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 12 }, elevation: 12 }),
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: DOCK.gap,
    paddingVertical: DOCK.padY,
    borderRadius: DOCK_HEIGHT / 2,
  },
  itemHover: {
    backgroundColor: "rgba(160, 188, 255, 0.05)",
  },
  pill: {
    width: DOCK.pillW,
    height: DOCK.pillH,
    alignItems: "center",
    justifyContent: "center",
  },
  pillIcon: {
    zIndex: 1,
  },
  pillBg: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: DOCK.pillH / 2,
    backgroundColor: Colors.textPrimary,
  },
  label: {
    fontFamily: Fonts.medium,
    fontSize: 11,
    lineHeight: DOCK.labelLine,
    letterSpacing: 0.15,
    maxWidth: "100%",
    paddingHorizontal: 2,
  },
  labelOn: {
    fontFamily: Fonts.semibold,
  },
});
