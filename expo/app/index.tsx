import { View, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import Colors from '@/constants/colors';
import { BrandMark } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import type { UserRole } from '@/types';

// Pantalla inicial de cada rol. AuthContext ya rechaza perfiles con un rol
// desconocido, asi que aqui no puede formarse el bucle index -> tabs ->
// sign-in -> index que habia antes.
const HOME_BY_ROLE: Record<UserRole, '/(tabs)/home' | '/(tabs)/company-home' | '/(tabs)/admin-home'> = {
  client: '/(tabs)/home',
  guard: '/(tabs)/home',
  company: '/(tabs)/company-home',
  admin: '/(tabs)/admin-home',
};

export default function Index() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.container}>
        <BrandMark size={64} />
      </View>
    );
  }

  if (!user) return <Redirect href="/auth/sign-in" />;
  return <Redirect href={HOME_BY_ROLE[user.role] ?? '/auth/sign-in'} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
