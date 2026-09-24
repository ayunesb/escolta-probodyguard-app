import { Alert } from 'react-native';

// Confirmacion de dos botones. Usa Alert.alert en todas las plataformas: en
// web lo dibuja <AlertHost/> con el diseno de la app (antes era el
// window.confirm del navegador, que algunos navegadores integrados suprimen).
export async function confirm(
  title: string,
  message: string,
  confirmLabel: string = 'OK',
  cancelLabel: string = 'Cancel',
  destructive: boolean = false
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}
