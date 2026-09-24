import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { AppText, Button, Input, PressableScale } from '@/components/ui';
import { Sheet } from '@/components/backoffice/Sheet';
import Colors from '@/constants/colors';
import { demoSandbox } from '@/demo/firebase';

type Snapshot = { accounts: { uid: string; name: string; role: string; email: string }[]; inbox: { id: string; type: string; title: string; body: string; createdAt: string; used?: boolean }[] };
export function DemoBanner() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const { t } = useTranslation('auth');
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => { void demoSandbox.snapshot().then(data => { if (active) setSnapshot(data); }); };
    refresh(); const unsubscribe = demoSandbox.subscribe(refresh);
    return () => { active = false; unsubscribe(); };
  }, []);
  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const reset = () => Alert.alert(t('publicDemo.reset'), t('publicDemo.resetHelp'), [
    { text: t('publicDemo.cancel'), style: 'cancel' },
    { text: t('publicDemo.reset'), style: 'destructive', onPress: () => run(async () => {
      await signOut();
      const keys = (await AsyncStorage.getAllKeys()).filter(k => k.startsWith('@rate_limit_'));
      await AsyncStorage.multiRemove(keys);
      await demoSandbox.reset(); setOpen(false); router.replace('/auth/sign-in');
    }) },
  ]);
  return <>
    <View style={{ backgroundColor: Colors.background, borderBottomWidth: 1, borderBottomColor: Colors.accentLine, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <AppText variant="caption" color={Colors.accentLight} style={{ flex: 1, minWidth: 140 }}>{t('publicDemo.banner')}</AppText>
      <PressableScale accessibilityRole="button" accessibilityLabel={t('publicDemo.controls')} onPress={() => setOpen(true)}><AppText variant="caption" color={Colors.textPrimary}>{t('publicDemo.controls')}{snapshot?.inbox.length ? ` (${snapshot.inbox.length})` : ''}</AppText></PressableScale>
      {user ? <PressableScale accessibilityRole="button" accessibilityLabel={t('publicDemo.switchRole')} onPress={async () => { await signOut(); router.replace('/auth/sign-in'); }}><AppText variant="caption" color={Colors.textPrimary}>{t('publicDemo.switchRole')}</AppText></PressableScale> : null}
    </View>
    <Sheet visible={open} onClose={() => setOpen(false)} title={t('publicDemo.controls')} subtitle={t('publicDemo.controlsHelp')}>
      {error ? <AppText color={Colors.error} accessibilityLiveRegion="polite">{error}</AppText> : null}
      <AppText variant="headline">{t('publicDemo.accounts')}</AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {snapshot?.accounts.map(a => <Button key={a.uid} title={`${a.name} · ${a.role}`} size="sm" variant="outline" fullWidth={false} disabled={busy} onPress={() => run(async () => { await signOut(); await demoSandbox.switchAccount(a.uid); setOpen(false); router.replace('/'); })} />)}
      </View>
      <AppText variant="headline">{t('publicDemo.inbox')}</AppText>
      <AppText variant="footnote">{t('publicDemo.inboxHelp')}</AppText>
      {!snapshot?.inbox.length ? <AppText variant="footnote">{t('publicDemo.emptyInbox')}</AppText> : null}
      {snapshot?.inbox.map(m => <View key={m.id} style={{ padding: 16, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, gap: 8 }}>
        <AppText variant="headline">{m.title}</AppText>
        <AppText variant="footnote">{m.body}</AppText>
        <AppText variant="caption">{new Date(m.createdAt).toLocaleString()}</AppText>
        {m.type === 'reset' && !m.used ? <Input label={t('publicDemo.newPassword')} accessibilityLabel={t('publicDemo.newPassword')} secureTextEntry value={password} onChangeText={setPassword} /> : null}
        {['verification', 'reset'].includes(m.type) ? <Button title={m.used ? t('publicDemo.done') : m.type === 'reset' ? t('publicDemo.setPassword') : t('publicDemo.verify')} size="sm" variant="secondary" disabled={m.used || busy} onPress={() => run(async () => { await demoSandbox.verify(m.id, password); setPassword(''); })} /> : null}
      </View>)}
      <Button title={t('publicDemo.reset')} variant="danger" onPress={reset} disabled={busy} />
    </Sheet>
  </>;
}
