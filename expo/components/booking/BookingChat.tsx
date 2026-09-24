// Chat de la reserva, embebido en el detalle. Mensajes en vivo con
// traduccion automatica al idioma del usuario y opcion de ver el original.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Languages, Send } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { ICON_STROKE, Radius, Space } from '@/constants/design';
import { AppText, IconButton, Input, PressableScale, Skeleton } from '@/components/ui';
import { chatService } from '@/services/chatService';
import type { ChatMessage, Language, UserRole } from '@/types';
import { formatTimeOfDay } from '@/i18n/format';

interface BookingChatProps {
  bookingId: string;
  clientId: string;
  guardId?: string;
  user: { id: string; role: UserRole; language: Language };
  // false: solo lectura (servicio terminado o cancelado)
  canSend: boolean;
  counterpartLabel: string; // "your protector" / "your client"
}

const timeOf = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : formatTimeOfDay(d);
};

export function BookingChat({ bookingId, clientId, guardId, user, canSend, counterpartLabel }: BookingChatProps) {
  const { t, i18n } = useTranslation('booking');
  // Los mensajes se traducen al idioma en que se usa la app ahora mismo, no al
  // del perfil (los perfiles antiguos traen 'en' aunque nadie lo eligiera).
  const language: Language = i18n.resolvedLanguage === 'es' ? 'es' : 'en';
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState<Record<string, boolean>>({});
  const lastIncomingRef = useRef<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    return chatService.subscribeToMessages(
      bookingId,
      language,
      (next) => {
        setMessages(next);
        setLoading(false);
      },
      user.id,
      (err) => {
        setLoadError(err.message);
        setLoading(false);
      }
    );
  }, [bookingId, user.id, language]);

  // Marca como leido cuando llega algo nuevo de la otra parte.
  useEffect(() => {
    const incoming = [...messages].reverse().find((m) => m.senderId !== user.id);
    if (!incoming || incoming.id === lastIncomingRef.current) return;
    lastIncomingRef.current = incoming.id;
    void chatService.markAsRead(bookingId, user.id);
  }, [messages, bookingId, user.id]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setSendError(null);
    try {
      await chatService.sendMessage(
        bookingId,
        user.id,
        user.role === 'guard' ? 'guard' : 'client',
        text,
        language,
        { clientId, guardId }
      );
      setDraft('');
    } catch (e) {
      setSendError(e instanceof Error ? e.message : t('chat.notSent'));
    } finally {
      setSending(false);
    }
  }, [draft, sending, bookingId, user.id, user.role, language, clientId, guardId, t]);

  return (
    <View style={styles.container}>
      <View style={styles.thread}>
        {loading ? (
          <>
            <Skeleton width="62%" height={40} radius={Radius.lg} />
            <Skeleton width="48%" height={40} radius={Radius.lg} style={styles.skeletonRight} />
          </>
        ) : loadError ? (
          <AppText variant="footnote" color={Colors.error}>
            {loadError}
          </AppText>
        ) : messages.length === 0 ? (
          <AppText variant="footnote" color={Colors.textTertiary} align="center" style={styles.empty}>
            {canSend ? t('chat.empty', { name: counterpartLabel }) : t('chat.emptyReadOnly')}
          </AppText>
        ) : (
          messages.map((m) => {
            const own = m.senderId === user.id;
            const translated = !!m.translatedText && m.translatedText !== m.text;
            const original = !!showOriginal[m.id];
            return (
              <View key={m.id} style={[styles.bubble, own ? styles.bubbleOwn : styles.bubbleOther]}>
                <AppText variant="body" selectable>
                  {translated && !original ? m.translatedText : m.text}
                </AppText>
                <View style={styles.meta}>
                  {translated ? (
                    <PressableScale
                      onPress={() => setShowOriginal((prev) => ({ ...prev, [m.id]: !prev[m.id] }))}
                      scaleTo={0.96}
                      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel={t(original ? 'chat.showTranslation' : 'chat.showOriginalA11y')}
                      style={styles.translateToggle}
                    >
                      <Languages size={12} color={Colors.textTertiary} strokeWidth={ICON_STROKE} />
                      <AppText variant="caption" color={Colors.textTertiary}>
                        {t(original ? 'chat.showTranslation' : 'chat.showOriginal')}
                      </AppText>
                    </PressableScale>
                  ) : null}
                  <AppText variant="caption" color={Colors.textTertiary} tabular>
                    {timeOf(m.timestamp)}
                  </AppText>
                </View>
              </View>
            );
          })
        )}
      </View>

      {canSend ? (
        <Input
          value={draft}
          onChangeText={(t) => {
            setDraft(t);
            if (sendError) setSendError(null);
          }}
          placeholder={t('chat.placeholder', { name: counterpartLabel })}
          multiline
          maxLength={1000}
          error={sendError}
          accessibilityLabel={t('chat.inputA11y')}
          containerStyle={styles.composer}
          trailing={
            <IconButton
              icon={Send}
              tone="accent"
              size={36}
              onPress={send}
              disabled={!draft.trim() || sending}
              accessibilityLabel={t('chat.send')}
            />
          }
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Space.md,
  },
  thread: {
    gap: Space.sm,
    minHeight: 64,
  },
  skeletonRight: {
    alignSelf: 'flex-end',
  },
  empty: {
    paddingVertical: Space.xl,
  },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: Space.md + 2,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.lg,
    borderWidth: 1,
    gap: Space.xs,
  },
  bubbleOwn: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.accentSoft,
    borderColor: Colors.accentLine,
    borderBottomRightRadius: Radius.xs,
  },
  bubbleOther: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.surfaceLight,
    borderColor: Colors.border,
    borderBottomLeftRadius: Radius.xs,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Space.md,
  },
  // Enlace pequeno dentro de la burbuja: el relleno y el hitSlop lo llevan
  // a ~44 px de alto sin inflar la burbuja.
  translateToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: Space.xs,
  },
  composer: {
    marginTop: Space.xs,
  },
});
