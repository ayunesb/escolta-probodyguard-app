import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { doc, getDoc, setDoc, updateDoc, collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { db as getDbInstance, auth as getAuthInstance } from '@/lib/firebase';
import { UserRole } from '@/types';
import i18n from '@/i18n';

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: boolean;
  badge?: number;
  priority?: 'default' | 'high' | 'max';
  categoryId?: string;
}

export interface NotificationPreferences {
  bookingUpdates: boolean;
  chatMessages: boolean;
  paymentAlerts: boolean;
  promotions: boolean;
  emergencyAlerts: boolean;
}

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  if (Platform.OS === 'android') {
    // Los nombres de canal se ven en los ajustes de Android: se vuelven a
    // registrar (misma id, nuevo nombre) cada vez que cambia el idioma.
    const configureAndroidChannels = () => {
      Notifications.setNotificationChannelAsync('booking-updates', {
        name: i18n.t('booking:notifications.channels.bookingUpdates'),
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#D4AF37',
        sound: 'default',
      });

      Notifications.setNotificationChannelAsync('chat-messages', {
        name: i18n.t('booking:notifications.channels.chatMessages'),
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 150, 150, 150],
        lightColor: '#D4AF37',
        sound: 'default',
      });

      Notifications.setNotificationChannelAsync('emergency', {
        name: i18n.t('booking:notifications.channels.emergency'),
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 250, 500],
        lightColor: '#FF0000',
        sound: 'default',
      });

      Notifications.setNotificationChannelAsync('payments', {
        name: i18n.t('booking:notifications.channels.payments'),
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 200],
        lightColor: '#D4AF37',
        sound: 'default',
      });
    };
    configureAndroidChannels();
    i18n.on('languageChanged', configureAndroidChannels);
  }
}

export const pushNotificationService = {
  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'web') {
      if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
      }
      return false;
    }

    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('[Push] Permission denied');
        return false;
      }

      console.log('[Push] Permission granted');
      return true;
    } catch (error) {
      console.error('[Push] Error requesting permissions:', error);
      return false;
    }
  },

  async registerDevice(userId: string, role: UserRole): Promise<string | null> {
    if (Platform.OS === 'web') {
      console.log('[Push] Web push notifications limited');
      return null;
    }

    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        return null;
      }

      const token = (await Notifications.getExpoPushTokenAsync()).data;

      // Un documento por (usuario, dispositivo), con id determinista: antes se
      // agregaba uno nuevo en cada arranque y el servidor mandaba el mismo
      // aviso N veces. El token tampoco se guarda ya en el perfil publico
      // users/{uid}, que cualquier usuario registrado puede leer.
      const tokenId = `${userId}_${token.replace(/[^A-Za-z0-9]/g, '').slice(-40)}`;
      await setDoc(
        doc(getDbInstance(), 'deviceTokens', tokenId),
        {
          userId,
          token,
          platform: Platform.OS,
          role,
          active: true,
          lastUsedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      return token;
    } catch (error) {
      console.error('[Push] Error registering device:', error);
      return null;
    }
  },

  async unregisterDevice(userId: string): Promise<void> {
    try {
      const tokensQuery = query(
        collection(getDbInstance(), 'deviceTokens'),
        where('userId', '==', userId)
      );
      const snapshot = await getDocs(tokensQuery);
      
      const deletePromises = snapshot.docs.map(doc => 
        updateDoc(doc.ref, { 
          active: false,
          deactivatedAt: new Date().toISOString() 
        })
      );
      
      await Promise.all(deletePromises);
      console.log('[Push] Device unregistered');
    } catch (error) {
      console.error('[Push] Error unregistering device:', error);
    }
  },

  async sendPushNotification(
    userId: string,
    payload: PushNotificationPayload
  ): Promise<void> {
    try {
      // Solo se encola. Antes esta funcion leia el documento del OTRO usuario
      // para sacar su pushToken, y eso ya no se permite: un cliente no puede
      // leer el padron. Ahora quien resuelve los tokens es la funcion de
      // servidor `enviarAvisoEncolado`, que corre con Admin SDK y ademas
      // atiende todos los aparatos del usuario, no solo el ultimo.
      // Forma que exigen las reglas: remitente = quien escribe, tipo de una
      // lista cerrada y, si el destinatario es otra persona, la reserva que
      // comparten. Titulo y cuerpo los arma el servidor desde plantillas: un
      // cliente ya no puede mandarle texto arbitrario a otro usuario.
      const senderId = getAuthInstance().currentUser?.uid;
      const type = typeof payload.data?.type === 'string' ? payload.data.type : undefined;
      if (!senderId || !type) return;
      await addDoc(collection(getDbInstance(), 'notifications'), {
        userId,
        senderId,
        type,
        ...(typeof payload.data?.bookingId === 'string' ? { bookingId: payload.data.bookingId } : {}),
        status: 'pending',
        read: false,
        createdAt: new Date().toISOString(),
      });

      console.log('[Push] Aviso encolado para:', userId);
    } catch (error) {
      console.error('[Push] Error sending push notification:', error);
    }
  },

  async sendLocalNotification(payload: PushNotificationPayload): Promise<void> {
    if (Platform.OS === 'web') {
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(payload.title, {
            body: payload.body,
            icon: '/icon.png',
            badge: '/icon.png',
          });
        } catch (error) {
          console.error('[Push] Web notification error:', error);
        }
      }
      return;
    }

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: payload.title,
          body: payload.body,
          data: payload.data || {},
          sound: payload.sound !== false,
          badge: payload.badge,
          priority: payload.priority === 'max' 
            ? Notifications.AndroidNotificationPriority.MAX 
            : Notifications.AndroidNotificationPriority.HIGH,
          categoryIdentifier: payload.categoryId,
        },
        trigger: null,
      });
      console.log('[Push] Local notification sent');
    } catch (error) {
      console.error('[Push] Error sending local notification:', error);
    }
  },

  async notifyBookingCreated(userId: string, bookingId: string): Promise<void> {
    await this.sendPushNotification(userId, {
      title: i18n.t('booking:notifications.bookingCreated.title'),
      body: i18n.t('booking:notifications.bookingCreated.body'),
      data: { type: 'booking_created', bookingId },
      categoryId: 'booking-updates',
      priority: 'high',
    });
  },

  async notifyBookingAccepted(
    userId: string,
    bookingId: string,
    guardName: string
  ): Promise<void> {
    await this.sendPushNotification(userId, {
      title: i18n.t('booking:notifications.bookingAccepted.title'),
      body: i18n.t('booking:notifications.bookingAccepted.body', { name: guardName }),
      data: { type: 'booking_accepted', bookingId },
      categoryId: 'booking-updates',
      priority: 'high',
    });
  },

  async notifyBookingRejected(
    userId: string,
    bookingId: string,
    reason?: string
  ): Promise<void> {
    await this.sendPushNotification(userId, {
      title: i18n.t('booking:notifications.bookingRejected.title'),
      body: reason || i18n.t('booking:notifications.bookingRejected.body'),
      data: { type: 'booking_rejected', bookingId },
      categoryId: 'booking-updates',
      priority: 'high',
    });
  },

  async notifyGuardEnRoute(
    userId: string,
    bookingId: string,
    guardName: string,
    eta: string
  ): Promise<void> {
    await this.sendPushNotification(userId, {
      title: i18n.t('booking:notifications.guardEnRoute.title'),
      body: i18n.t('booking:notifications.guardEnRoute.body', { name: guardName, eta }),
      data: { type: 'guard_en_route', bookingId },
      categoryId: 'booking-updates',
      priority: 'high',
    });
  },

  async notifyServiceStarted(
    userId: string,
    bookingId: string
  ): Promise<void> {
    await this.sendPushNotification(userId, {
      title: i18n.t('booking:notifications.serviceStarted.title'),
      body: i18n.t('booking:notifications.serviceStarted.body'),
      data: { type: 'service_started', bookingId },
      categoryId: 'booking-updates',
      priority: 'high',
    });
  },

  async notifyServiceCompleted(
    userId: string,
    bookingId: string
  ): Promise<void> {
    await this.sendPushNotification(userId, {
      title: i18n.t('booking:notifications.serviceCompleted.title'),
      body: i18n.t('booking:notifications.serviceCompleted.body'),
      data: { type: 'service_completed', bookingId },
      categoryId: 'booking-updates',
      priority: 'high',
    });
  },

  async notifyNewMessage(
    userId: string,
    bookingId: string,
    senderName: string,
    messagePreview: string
  ): Promise<void> {
    await this.sendPushNotification(userId, {
      title: i18n.t('booking:notifications.newMessage.title', { name: senderName }),
      body: messagePreview,
      data: { type: 'new_message', bookingId },
      categoryId: 'chat-messages',
      priority: 'high',
    });
  },

  async notifyPaymentSuccess(
    userId: string,
    bookingId: string,
    amount: number
  ): Promise<void> {
    await this.sendPushNotification(userId, {
      title: i18n.t('booking:notifications.paymentSuccess.title'),
      body: i18n.t('booking:notifications.paymentSuccess.body', { amount: amount.toFixed(2) }),
      data: { type: 'payment_success', bookingId },
      categoryId: 'payments',
      priority: 'default',
    });
  },

  async notifyPaymentFailed(
    userId: string,
    bookingId: string,
    reason: string
  ): Promise<void> {
    await this.sendPushNotification(userId, {
      title: i18n.t('booking:notifications.paymentFailed.title'),
      body: i18n.t('booking:notifications.paymentFailed.body', { reason }),
      data: { type: 'payment_failed', bookingId },
      categoryId: 'payments',
      priority: 'high',
    });
  },

  async notifyEmergency(
    userId: string,
    bookingId: string,
    message: string
  ): Promise<void> {
    await this.sendPushNotification(userId, {
      title: i18n.t('booking:notifications.emergency.title'),
      body: message,
      data: { type: 'emergency', bookingId },
      categoryId: 'emergency',
      priority: 'max',
    });
  },

  async notifyNewBookingRequest(
    guardId: string,
    bookingId: string,
    clientName: string
  ): Promise<void> {
    await this.sendPushNotification(guardId, {
      title: i18n.t('booking:notifications.newBookingRequest.title'),
      body: i18n.t('booking:notifications.newBookingRequest.body', { name: clientName }),
      data: { type: 'new_booking_request', bookingId },
      categoryId: 'booking-updates',
      priority: 'high',
    });
  },

  async updateNotificationPreferences(
    userId: string,
    preferences: NotificationPreferences
  ): Promise<void> {
    try {
      await updateDoc(doc(getDbInstance(), 'users', userId), {
        notificationPreferences: preferences,
        preferencesUpdatedAt: new Date().toISOString(),
      });
      console.log('[Push] Preferences updated');
    } catch (error) {
      console.error('[Push] Error updating preferences:', error);
    }
  },

  async getNotificationPreferences(
    userId: string
  ): Promise<NotificationPreferences> {
    try {
      // Lectura directa por ID. Antes consultaba la coleccion filtrando por el
      // campo `id`, y una consulta asi es una operacion de lista: las reglas la
      // niegan aunque el usuario pida sus propios datos, porque la regla mira
      // el ID del documento, no un campo.
      const userDoc = await getDoc(doc(getDbInstance(), 'users', userId));

      if (userDoc.exists()) {
        const userData = userDoc.data();
        return userData.notificationPreferences || {
          bookingUpdates: true,
          chatMessages: true,
          paymentAlerts: true,
          promotions: false,
          emergencyAlerts: true,
        };
      }
    } catch (error) {
      console.error('[Push] Error getting preferences:', error);
    }

    return {
      bookingUpdates: true,
      chatMessages: true,
      paymentAlerts: true,
      promotions: false,
      emergencyAlerts: true,
    };
  },

  setupNotificationListeners(
    onNotificationReceived?: (notification: Notifications.Notification) => void,
    onNotificationTapped?: (response: Notifications.NotificationResponse) => void
  ): () => void {
    if (Platform.OS === 'web') {
      console.log('[Push] Listeners not supported on web');
      return () => {};
    }

    const receivedSubscription = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log('[Push] Notification received:', notification);
        onNotificationReceived?.(notification);
      }
    );

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        console.log('[Push] Notification tapped:', response);
        onNotificationTapped?.(response);
      }
    );

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  },

  async setBadgeCount(count: number): Promise<void> {
    if (Platform.OS === 'web') return;
    try {
      await Notifications.setBadgeCountAsync(count);
    } catch (error) {
      console.error('[Push] Error setting badge count:', error);
    }
  },

  async getBadgeCount(): Promise<number> {
    if (Platform.OS === 'web') return 0;
    try {
      return await Notifications.getBadgeCountAsync();
    } catch (error) {
      console.error('[Push] Error getting badge count:', error);
      return 0;
    }
  },

  async clearBadge(): Promise<void> {
    await this.setBadgeCount(0);
  },

  async cancelAllNotifications(): Promise<void> {
    if (Platform.OS === 'web') return;
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      await Notifications.dismissAllNotificationsAsync();
      console.log('[Push] All notifications cancelled');
    } catch (error) {
      console.error('[Push] Error cancelling notifications:', error);
    }
  },
};
