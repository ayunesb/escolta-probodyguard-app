// Chat de la reserva, embebido en el detalle. Mensajes en vivo con
// traduccion automatica al idioma del usuario y opcion de ver el original.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Languages, Send } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { ICON_STROKE, Radius, Space } from '@/constants/design';
import { AppText, IconButton, Input, PressableScale, Skeleton } from '@/components/ui';
import { chatService } from '@/services/chatService';
import type { ChatMessage, Language, UserRole } from '@/types';

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
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

export function BookingChat({ bookingId, clientId, guardId, user, canSend, counterpartLabel }: BookingChatProps) {
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
      user.language,
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
  }, [bookingId, user.id, user.language]);

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
        user.language,
        { clientId, guardId }
      );
      setDraft('');
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Your message wasn't sent.");
    } finally {
      setSending(false);
    }
  }, [draft, sending, bookingId, user.id, user.role, user.language, clientId, guardId]);

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
            {canSend ? `No messages yet. Write to ${counterpartLabel} to coordinate the pickup.` : 'No messages in this booking.'}
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
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={original ? 'Show translation' : 'Show original message'}
                      style={styles.translateToggle}
                    >
                      <Languages size={12} color={Colors.textTertiary} strokeWidth={ICON_STROKE} />
                      <AppText variant="caption" color={Colors.textTertiary}>
                        {original ? 'Show translation' : 'Show original'}
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
          placeholder={`Message ${counterpartLabel}…`}
          multiline
          maxLength={1000}
          error={sendError}
          accessibilityLabel="Message"
          containerStyle={styles.composer}
          trailing={
            <IconButton
              icon={Send}
              tone="accent"
              size={36}
              onPress={send}
              disabled={!draft.trim() || sending}
              accessibilityLabel="Send message"
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
  translateToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  composer: {
    marginTop: Space.xs,
  },
});
