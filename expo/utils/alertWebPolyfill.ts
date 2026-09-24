import { Alert, Platform } from 'react-native';

export type AlertButton = {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

export type AlertRequest = { title: string; message?: string; buttons: AlertButton[] };

type Host = (request: AlertRequest) => void;
let host: Host | null = null;

// El <AlertHost/> montado en app/_layout.tsx se registra aqui y dibuja un
// dialogo propio con TODOS los botones. Sin host (p. ej. antes de montar)
// se cae a window.confirm/window.alert.
export function registerAlertHost(fn: Host | null): void {
  host = fn;
}

/**
 * react-native-web trae Alert.alert() como un no-op total, asi que todas las
 * llamadas de la app (confirmaciones, errores, avisos) no hacian nada en web.
 * Esto lo reemplaza sin tocar los sitios que lo llaman.
 */
export function installAlertWebPolyfill(): void {
  if (Platform.OS !== 'web') return;

  Alert.alert = (title: string, message?: string, buttons?: AlertButton[]): void => {
    const list = buttons && buttons.length > 0 ? buttons : [{ text: 'OK' } as AlertButton];

    if (host) {
      host({ title, message, buttons: list });
      return;
    }

    const text = message ? `${title}\n\n${message}` : title;
    if (list.length === 1) {
      if (typeof window !== 'undefined' && typeof window.alert === 'function') window.alert(text);
      list[0].onPress?.();
      return;
    }
    const cancelButton = list.find((b) => b.style === 'cancel');
    const confirmButton = list.find((b) => b !== cancelButton) ?? list[list.length - 1];
    const confirmed = typeof window !== 'undefined' && typeof window.confirm === 'function' ? window.confirm(text) : true;
    if (confirmed) confirmButton?.onPress?.();
    else cancelButton?.onPress?.();
  };
}
