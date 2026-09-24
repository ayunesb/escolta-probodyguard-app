import { StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { House } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { Space } from '@/constants/design';
import { AppText, BrandMark, Button, Screen } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';

export default function NotFoundScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false, title: 'Page not found' }} />
      <Screen glow scroll={false}>
        <View style={styles.content} testID="not-found-container">
          <BrandMark size={64} />
          <AppText variant="overline" color={Colors.gold} style={styles.code}>
            Error 404
          </AppText>
          <AppText variant="title1" align="center" accessibilityRole="header">
            This page doesn’t exist
          </AppText>
          <AppText variant="callout" align="center" style={styles.message}>
            The link may be out of date, or the page has moved. Your account and bookings are safe.
          </AppText>
          <View style={styles.actions}>
            <Button
              title={user ? 'Go to my home' : 'Go to sign in'}
              icon={House}
              onPress={() => router.replace(user ? '/' : '/auth/sign-in')}
            />
            <Button title="Go back" variant="ghost" onPress={goBack} />
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
