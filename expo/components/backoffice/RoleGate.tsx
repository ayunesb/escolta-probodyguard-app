import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Lock } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { Space } from '@/constants/design';
import { EmptyState, NavBar, Screen, SkeletonCard } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import type { UserRole } from '@/types';

const AUDIENCE: Record<UserRole, string> = {
  admin: 'administrators',
  company: 'security company accounts',
  guard: 'guard accounts',
  client: 'client accounts',
};

export function AccessDenied({ roles, nav = false }: { roles: UserRole[]; nav?: boolean }) {
  const router = useRouter();
  const { user } = useAuth();
  const audience = roles.map((r) => AUDIENCE[r]).join(' and ');
  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      {nav ? <NavBar title="" /> : null}
      <Screen padTop={!nav} contentStyle={{ justifyContent: 'center', paddingTop: Space.huge }}>
        <EmptyState
          icon={Lock}
          title="Restricted area"
          message={`This part of Escolta Pro is only available to ${audience}.`}
          actionLabel={user ? 'Go to my home' : 'Sign in'}
          onAction={() => router.replace(user ? '/' : '/auth/sign-in')}
        />
      </Screen>
    </View>
  );
}

// Las pantallas de back office se pueden abrir por URL aunque no esten en las
// pestanas de ese rol. Sin esta puerta, un cliente que entrara a
// /admin-users vera la pantalla montarse (y sus lecturas fallar a medias).
export function RoleGate({ roles, nav = false, children }: { roles: UserRole[]; nav?: boolean; children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        {nav ? <NavBar title="" /> : null}
        <Screen padTop={!nav} contentStyle={{ paddingTop: Space.xl }}>
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </Screen>
      </View>
    );
  }

  if (!user || !user.role || !roles.includes(user.role)) {
    return <AccessDenied roles={roles} nav={nav} />;
  }

  return <>{children}</>;
}
