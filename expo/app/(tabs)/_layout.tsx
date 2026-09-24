import React from "react";
import { Platform, StyleSheet, View } from "react-native";
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
import { useAuth } from "@/contexts/AuthContext";
import Colors from "@/constants/colors";
import { Fonts } from "@/constants/design";
import type { UserRole } from "@/types";

type TabName = "home" | "bookings" | "profile" | "company-home" | "company-guards" | "admin-home" | "admin-kyc" | "admin-users";
type TabSpec = { name: TabName; title: string; icon: LucideIcon };

// Pestanas visibles por rol, en orden. Las demas se registran con href:null
// (ocultas) porque expo-router necesita declarar todas las rutas del grupo.
const TABS_BY_ROLE: Record<UserRole, TabSpec[]> = {
  client: [
    { name: "home", title: "Protect", icon: Shield },
    { name: "bookings", title: "Bookings", icon: CalendarDays },
    { name: "profile", title: "Account", icon: UserRound },
  ],
  guard: [
    { name: "home", title: "Jobs", icon: BriefcaseBusiness },
    { name: "bookings", title: "History", icon: CalendarDays },
    { name: "profile", title: "Account", icon: UserRound },
  ],
  company: [
    { name: "company-home", title: "Overview", icon: LayoutDashboard },
    { name: "company-guards", title: "Roster", icon: Shield },
    { name: "bookings", title: "Bookings", icon: CalendarDays },
    { name: "profile", title: "Account", icon: UserRound },
  ],
  admin: [
    { name: "admin-home", title: "Overview", icon: LayoutDashboard },
    { name: "admin-kyc", title: "Verification", icon: FileCheck2 },
    { name: "admin-users", title: "Members", icon: UsersIcon },
    { name: "bookings", title: "Bookings", icon: CalendarDays },
    { name: "profile", title: "Account", icon: UserRound },
  ],
};

const ALL_TABS: TabName[] = ["home", "bookings", "profile", "company-home", "company-guards", "admin-home", "admin-kyc", "admin-users"];

// Icono con pastilla detras cuando esta activo (como las referencias premium).
function TabIcon({ icon: Icon, focused, color }: { icon: LucideIcon; focused: boolean; color: string }) {
  return (
    <View style={[styles.iconWrap, focused ? styles.iconWrapOn : null]}>
      <Icon size={20} color={focused ? Colors.textOnAccent : color} strokeWidth={focused ? 2 : 1.6} />
    </View>
  );
}

export default function TabLayout() {
  const { user, isLoading } = useAuth();
  const insets = useSafeAreaInsets();

  if (isLoading) return <View style={styles.blank} />;
  if (!user) return <Redirect href="/auth/sign-in" />;

  const visible = TABS_BY_ROLE[user.role];
  if (!visible) return <Redirect href="/auth/sign-in" />;

  const hidden = ALL_TABS.filter((name) => !visible.some((t) => t.name === name));
  // Dock flotante: pastilla de vidrio separada de los bordes. Las pantallas
  // reservan su alto abajo (sceneStyle) para que nada quede tapado.
  const dockBottom = Math.max(insets.bottom, 12);
  const dockHeight = 72;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.textPrimary,
        tabBarInactiveTintColor: Colors.textTertiary,
        tabBarStyle: {
          position: "absolute",
          left: 16,
          right: 16,
          bottom: dockBottom,
          height: dockHeight,
          paddingTop: 8,
          paddingBottom: 11,
          borderRadius: 36,
          borderTopWidth: 1,
          borderWidth: 1,
          borderColor: Colors.glassBorder,
          borderTopColor: Colors.glassBorder,
          backgroundColor: "rgba(14, 21, 38, 0.92)",
          elevation: 0,
          ...(Platform.OS === "web"
            ? ({ backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", boxShadow: "0 18px 40px rgba(0, 4, 16, 0.55)" } as object)
            : { shadowColor: "#000410", shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 12 } }),
        },
        tabBarItemStyle: { borderRadius: 24 },
        tabBarLabelStyle: {
          fontFamily: Fonts.medium,
          fontSize: 10.5,
          lineHeight: 15,
          letterSpacing: 0.2,
          marginTop: 3,
        },
        sceneStyle: { backgroundColor: Colors.background, paddingBottom: dockHeight + dockBottom + 8 },
      }}
    >
      {visible.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarAccessibilityLabel: tab.title,
            tabBarIcon: ({ color, focused }) => <TabIcon icon={tab.icon} focused={focused} color={color} />,
          }}
        />
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
  iconWrap: {
    width: 44,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapOn: {
    backgroundColor: Colors.textPrimary,
  },
});
