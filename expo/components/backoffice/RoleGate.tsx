import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { Space } from '@/constants/design';
import { EmptyState, NavBar, Screen, SkeletonCard } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import type { UserRole } from '@/types';

export function AccessDenied({ roles, nav = false }: { roles: UserRole[]; nav?: boolean }) {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation('backoffice');
  const names = roles.map((r) => t(`accessDenied.audience.${r}`));
  const audience =
    names.length > 1 ? t('accessDenied.list', { first: names.slice(0, -1).join(', '), last: names[names.length - 1] }) : names[0] ?? '';
  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      {nav ? <NavBar title="" /> : null}
      <Screen padTop={!nav} contentStyle={{ justifyContent: 'center', paddingTop: Space.huge }}>
        <EmptyState
          icon={Lock}
          title={t('accessDenied.title')}
          message={t('accessDenied.message', { audience })}
          actionLabel={user ? t('accessDenied.goHome') : t('accessDenied.signIn')}
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
