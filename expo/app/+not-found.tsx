import { StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { House } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { Space } from '@/constants/design';
import { AppText, BrandMark, Button, Screen } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';

export default function NotFoundScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation(['nav', 'common']);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false, title: t('notFound.screenTitle') }} />
      <Screen glow scroll={false}>
        <View style={styles.content} testID="not-found-container">
          <BrandMark size={64} />
          <AppText variant="overline" color={Colors.accent} style={styles.code}>
            {t('notFound.code')}
          </AppText>
          <AppText variant="title1" align="center" accessibilityRole="header">
            {t('notFound.title')}
          </AppText>
          <AppText variant="callout" align="center" style={styles.message}>
            {t('notFound.message')}
          </AppText>
          <View style={styles.actions}>
            <Button
              title={user ? t('notFound.goHome') : t('notFound.goSignIn')}
              icon={House}
              onPress={() => router.replace(user ? '/' : '/auth/sign-in')}
            />
            <Button title={t('common:actions.goBack')} variant="ghost" onPress={goBack} />
          </View>
        </View>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Space.gutter,
    gap: Space.md,
    paddingBottom: Space.huge,
  },
  code: {
    marginTop: Space.xl,
  },
  message: {
    maxWidth: 340,
  },
  actions: {
    alignSelf: 'stretch',
    gap: Space.sm,
    marginTop: Space.xl,
  },
});
