import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { registerForPushNotificationsAsync } from '@/services/notificationService';
import Constants from 'expo-constants';
import { PUBLIC_DEMO } from '@/constants/demo';

interface NotificationContextProps {
  expoPushToken?: string;
  notification?: Notifications.Notification;
}

const NotificationContext = createContext<NotificationContextProps>({});

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [expoPushToken, setExpoPushToken] = useState<string | undefined>();
  const [notification, setNotification] = useState<Notifications.Notification | undefined>();

  useEffect(() => {
    if (PUBLIC_DEMO) return;
    // Skip notifications setup in Expo Go on Android with SDK 53+
    const isExpoGo = Constants.appOwnership === 'expo';
    const isAndroid = Platform.OS === 'android';
    
    if (isExpoGo && isAndroid) {
      console.warn('[NotificationContext] Skipping notification setup in Expo Go on Android (SDK 53+). Use development build for notifications.');
      return;
    }

    const setupNotifications = async () => {
      try {
        const token = await registerForPushNotificationsAsync();
        if (token) setExpoPushToken(token);
      } catch (error) {
        console.error('[NotificationContext] Failed to register for notifications:', error);
      }
    };

    setupNotifications();

    const notificationListener = Notifications.addNotificationReceivedListener(setNotification);
    const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('[Notification] User responded:', response);
    });

    return () => {
      notificationListener.remove();
      responseListener.remove();
    };
  }, []);

  // ✅ Memoize the context value to prevent infinite re-renders
  const contextValue = useMemo(
    () => ({ expoPushToken, notification }),
    [expoPushToken, notification]
  );

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotification = () => useContext(NotificationContext);
