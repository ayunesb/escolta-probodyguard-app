import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { AppText, PressableScale } from '@/components/ui';
import Colors from '@/constants/colors';

export function DemoBanner() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const { t } = useTranslation('auth');
  return (
    <View style={{ backgroundColor: Colors.background, borderBottomWidth: 1, borderBottomColor: Colors.accentLine, paddingHorizontal: 20, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <AppText variant="caption" color={Colors.accentLight} style={{ flex: 1 }}>{t('publicDemo.banner')}</AppText>
      {user ? <PressableScale accessibilityRole="button" accessibilityLabel={t('publicDemo.switchRole')} onPress={async () => { await signOut(); router.replace('/auth/sign-in'); }}><AppText variant="caption" color={Colors.textPrimary}>{t('publicDemo.switchRole')}</AppText></PressableScale> : null}
    </View>
  );
}
