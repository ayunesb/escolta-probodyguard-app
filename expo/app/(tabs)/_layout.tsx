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

function TabIcon({ icon: Icon, focused, color }: { icon: LucideIcon; focused: boolean; color: string }) {
  return (
    <View style={styles.iconWrap}>
      <View style={[styles.indicator, focused ? styles.indicatorOn : null]} />
      <Icon size={22} color={color} strokeWidth={focused ? 2 : 1.6} />
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
  const bottom = Math.max(insets.bottom, Platform.OS === "web" ? 10 : 8);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.gold,
        tabBarInactiveTintColor: Colors.textTertiary,
        tabBarStyle: {
          backgroundColor: Colors.background,
          borderTopColor: Colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 64 + bottom,
          paddingTop: 8,
          paddingBottom: bottom,
          elevation: 0,
        },
        tabBarLabelStyle: {
          fontFamily: Fonts.medium,
          fontSize: 11,
          lineHeight: 14,
          letterSpacing: 0.2,
          marginTop: 3,
        },
        sceneStyle: { backgroundColor: Colors.background },
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
    alignItems: "center",
    justifyContent: "center",
  },
  indicator: {
    position: "absolute",
    top: -9,
    width: 18,
    height: 2,
    borderRadius: 1,
    backgroundColor: "transparent",
  },
  indicatorOn: {
    backgroundColor: Colors.gold,
  },
});
