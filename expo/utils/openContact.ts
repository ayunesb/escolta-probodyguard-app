import { Alert, Linking } from 'react-native';
import { PUBLIC_DEMO } from '@/constants/demo';
import i18n from '@/i18n';

/** A demo call/email/WhatsApp action always terminates in the local inbox. */
export async function openContact(url: string): Promise<void> {
  if (PUBLIC_DEMO) {
    const { demoSandbox } = await import('@/demo/firebase');
    await demoSandbox.record('contact', i18n.t('auth:publicDemo.contactTitle'), url);
    Alert.alert(i18n.t('auth:publicDemo.contactTitle'), i18n.t('auth:publicDemo.contactHelp'));
    return;
  }
  await Linking.openURL(url);
}
