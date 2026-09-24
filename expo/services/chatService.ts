import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db as getDbInstance } from '@/lib/firebase';
import { ChatMessage, Language } from '@/types';
import { translationService } from './translationService';
import { rateLimitService } from './rateLimitService';
import { logger } from '@/utils/logger';

export interface TypingIndicator {
  userId: string;
  userName: string;
  timestamp: string;
}

// Ultimos N mensajes de una conversacion. Una reserva tiene pocas horas de
// chat; 200 cubre de sobra sin descargar historiales enormes.
const MESSAGE_LIMIT = 200;
const MAX_MESSAGE_LENGTH = 1000;

// Las reglas de Firestore solo dejan listar mensajes si la consulta filtra por
// participantIds array-contains <uid> (ver firestore.rules). Toda consulta de
// mensajes pasa por aqui para no olvidarlo.
function participantQuery(bookingId: string, userId: string, ordered: boolean): Query<DocumentData> {
  const base = collection(getDbInstance(), 'messages');
  return ordered
    ? query(
        base,
        where('bookingId', '==', bookingId),
        where('participantIds', 'array-contains', userId),
        orderBy('timestamp', 'desc'),
        limit(MESSAGE_LIMIT)
      )
    : query(
        base,
        where('bookingId', '==', bookingId),
        where('participantIds', 'array-contains', userId),
        limit(MESSAGE_LIMIT)
      );
}

const isMissingIndex = (error: unknown) =>
  String((error as { code?: unknown } | null)?.code ?? '') === 'failed-precondition';

function toIso(value: unknown): string {
  if (value && typeof (value as Timestamp).toDate === 'function') return (value as Timestamp).toDate().toISOString();
  if (typeof value === 'string') return value;
  // serverTimestamp pendiente de escribir: se muestra como "ahora".
  return new Date().toISOString();
}

function toMessage(d: QueryDocumentSnapshot<DocumentData>): ChatMessage {
  const data = d.data();
  return {
    id: d.id,
    bookingId: data.bookingId,
    senderId: data.senderId,
    senderRole: data.senderRole,
    text: data.text ?? '',
    originalLanguage: data.originalLanguage,
    translatedText: data.translatedText,
    translatedLanguage: data.translatedLanguage,
    timestamp: toIso(data.timestamp),
  };
}

const oldestFirst = (a: ChatMessage, b: ChatMessage) => a.timestamp.localeCompare(b.timestamp);

export const chatService = {
  async sendMessage(
    bookingId: string,
    senderId: string,
    senderRole: 'client' | 'guard',
    text: string,
    originalLanguage: Language,
    participants: { clientId: string; guardId?: string }
  ): Promise<void> {
    const body = text.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!body) return;

    const rateLimitCheck = await rateLimitService.checkRateLimit('chat', `${bookingId}_${senderId}`);
    if (!rateLimitCheck.allowed) {
      throw new Error(rateLimitService.getRateLimitError('chat', rateLimitCheck.blockedUntil ?? Date.now()));
    }

    // clientId/guardId/participantIds viajan en el mensaje porque las reglas
    // de Firestore no pueden leer la reserva (vive en Realtime Database).
    const messageData = {
      bookingId,
      senderId,
      senderRole,
      text: body,
      originalLanguage,
      timestamp: Timestamp.now(),
      clientId: participants.clientId,
      guardId: participants.guardId ?? null,
      participantIds: [participants.clientId, participants.guardId].filter((id): id is string => Boolean(id)),
    };

    try {
      await addDoc(collection(getDbInstance(), 'messages'), messageData);
    } catch (error) {
      logger.error('[Chat] Error sending message', { bookingId, error });
      throw new Error("Your message wasn't sent. Please try again.");
    }
  },

  // Mensajes en vivo, del mas antiguo al mas reciente, con traduccion al
  // idioma del usuario. Las traducciones se guardan por mensaje: antes cada
  // cambio del chat volvia a traducir TODOS los mensajes.
  subscribeToMessages(
    bookingId: string,
    userLanguage: Language,
    onMessagesUpdate: (messages: ChatMessage[]) => void,
    currentUserId: string,
    onError?: (error: Error) => void
  ): () => void {
    const translations = new Map<string, string | null>();
    let closed = false;
    let unsubscribe: () => void = () => {};
    let latestRun = 0;

    const translateMissing = async (messages: ChatMessage[]) => {
      const run = ++latestRun;
      const pending = messages.filter(
        (m) => m.originalLanguage && m.originalLanguage !== userLanguage && !translations.has(m.id)
      );
      if (pending.length === 0) return;
      await Promise.all(
        pending.map(async (m) => {
          try {
            const translated = await translationService.translate(m.text, m.originalLanguage, userLanguage);
            translations.set(m.id, translated && translated !== m.text ? translated : null);
          } catch (error) {
            translations.set(m.id, null);
            logger.error('[Chat] Translation error', { error });
          }
        })
      );
      if (!closed && run === latestRun) emit(messages);
    };

    const emit = (messages: ChatMessage[]) => {
      if (closed) return;
      onMessagesUpdate(
        messages.map((m) => {
          const translated = translations.get(m.id);
          return translated ? { ...m, translatedText: translated, translatedLanguage: userLanguage } : m;
        })
      );
    };

    const listen = (ordered: boolean) => {
      unsubscribe = onSnapshot(
        participantQuery(bookingId, currentUserId, ordered),
        (snapshot) => {
          const messages = snapshot.docs.map(toMessage).sort(oldestFirst);
          emit(messages);
          void translateMissing(messages);
        },
        (error) => {
          // Sin el indice compuesto (bookingId, participantIds, timestamp) la
          // consulta ordenada falla: se sigue sin ordenar en el servidor.
          if (ordered && isMissingIndex(error)) {
            logger.warn('[Chat] Ordered message query needs a composite index; using unordered fallback');
            listen(false);
            return;
          }
          logger.error('[Chat] Message subscription failed', { bookingId, error });
          onError?.(new Error("Messages couldn't be loaded."));
        }
      );
    };

    try {
      listen(true);
    } catch (error) {
      logger.error('[Chat] Error subscribing to messages', { bookingId, error });
      onError?.(new Error("Messages couldn't be loaded."));
    }

    return () => {
      closed = true;
      unsubscribe();
    };
  },

  async getMessages(bookingId: string, userId: string): Promise<ChatMessage[]> {
    try {
      const snapshot = await getDocs(participantQuery(bookingId, userId, false));
      return snapshot.docs.map(toMessage).sort(oldestFirst);
    } catch (error) {
      logger.error('[Chat] Error getting messages', { bookingId, error });
      return [];
    }
  },

  async getUnreadCount(bookingId: string, userId: string): Promise<number> {
    try {
      const snapshot = await getDocs(participantQuery(bookingId, userId, false));
      return snapshot.docs.filter((d) => {
        const data = d.data();
        return data.senderId !== userId && data.read !== true;
      }).length;
    } catch (error) {
      logger.error('[Chat] Error getting unread count', { bookingId, error });
      return 0;
    }
  },

  async setTyping(bookingId: string, userId: string, userName: string, isTyping: boolean): Promise<void> {
    try {
      const typingRef = doc(getDbInstance(), 'typing', `${bookingId}_${userId}`);
      if (isTyping) {
        await setDoc(typingRef, { bookingId, userId, userName, timestamp: Timestamp.now() });
      } else {
        await deleteDoc(typingRef);
      }
    } catch (error) {
      logger.error('[Chat] Error setting typing status', { error });
    }
  },

  subscribeToTyping(
    bookingId: string,
    currentUserId: string,
    onTypingUpdate: (typingUsers: TypingIndicator[]) => void
  ): () => void {
    try {
      const typingQuery = query(collection(getDbInstance(), 'typing'), where('bookingId', '==', bookingId));
      return onSnapshot(
        typingQuery,
        (snapshot) => {
          const now = Date.now();
          const typingUsers: TypingIndicator[] = [];
          snapshot.forEach((d) => {
            const data = d.data();
            const at = data.timestamp?.toDate?.().getTime?.() ?? 0;
            if (data.userId !== currentUserId && now - at < 5000) {
              typingUsers.push({ userId: data.userId, userName: data.userName, timestamp: new Date(at).toISOString() });
            }
          });
          onTypingUpdate(typingUsers);
        },
        (error) => logger.error('[Chat] Typing subscription failed', { bookingId, error })
      );
    } catch (error) {
      logger.error('[Chat] Error subscribing to typing', { error });
      return () => {};
    }
  },

  // Marca como leidos los mensajes que recibio este usuario. La consulta va
  // filtrada por participante (las reglas rechazan cualquier otra) y solo
  // toca los que no estan leidos.
  async markAsRead(bookingId: string, userId: string): Promise<void> {
    try {
      const snapshot = await getDocs(participantQuery(bookingId, userId, false));
      const unread = snapshot.docs.filter((d) => {
        const data = d.data();
        return data.senderId !== userId && data.read !== true;
      });
      for (const d of unread) {
        try {
          await updateDoc(d.ref, { read: true });
        } catch (error) {
          // Las reglas actuales no permiten actualizar mensajes: se deja de
          // intentar en vez de llenar el log con un error por mensaje.
          logger.log('[Chat] Read receipts not permitted by rules', { message: (error as Error)?.message });
          return;
        }
      }
    } catch (error) {
      logger.error('[Chat] Error marking messages as read', { bookingId, error });
    }
  },
};
