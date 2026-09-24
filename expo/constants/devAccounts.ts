// Cuentas de prueba del EMULADOR LOCAL (proyecto demo-escolta).
//
// Solo existen dentro del emulador que levanta `npm run dev:emulated`; en el
// proyecto real de Firebase no existen y esta contrasena no abre nada. La
// pantalla de acceso muestra los botones de acceso rapido unicamente cuando
// USING_EMULATORS es verdadero (desarrollo + EXPO_PUBLIC_USE_EMULATORS=1).
//
// Sin imports a proposito: el sembrador (scripts/emulator/seed.mjs) importa
// este archivo directamente desde Node.

export const DEV_PASSWORD = 'EscoltaDev!2026';

export type DevRole = 'client' | 'guard' | 'company' | 'admin';

export const DEV_ACCOUNTS: Record<DevRole, { email: string; name: string; label: string; description: string }> = {
  client: {
    email: 'sofia@cliente.test',
    name: 'Sofía Márquez',
    label: 'Client',
    description: 'Book protection, pay, track',
  },
  guard: {
    email: 'diego@escolta.test',
    name: 'Diego Ramírez',
    label: 'Protector',
    description: 'Accept jobs, start with code',
  },
  company: {
    email: 'valeria@sentinela.test',
    name: 'Valeria Ortiz',
    label: 'Company',
    description: 'Manage a roster of guards',
  },
  admin: {
    email: 'andres@escoltapro.test',
    name: 'Andrés Fuentes',
    label: 'Admin',
    description: 'Verification & back office',
  },
};
