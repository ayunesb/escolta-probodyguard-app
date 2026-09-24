/**
 * Avisos push.
 *
 *  1. `avisarCambioDeReserva` — disparador de Realtime Database sobre
 *     /bookings/{bookingId}. Las reservas viven en RTDB (CONTRACT §2); antes
 *     este disparador escuchaba la coleccion `bookings` de Firestore, que
 *     esta vacia, y nunca se ejecutaba.
 *  2. `enviarAvisoEncolado` — vacia la cola `notifications`. El titulo y el
 *     cuerpo de los avisos que encola un CLIENTE se arman aqui con una
 *     plantilla por `type`: antes se enviaba tal cual el texto del cliente,
 *     y cualquiera podia mandar un push con cualquier texto (phishing) a
 *     cualquier usuario. Solo los avisos del propio servidor (senderId
 *     'system', ver alerts.ts) conservan su texto.
 *  3. `avisarEmergencia` — alerta de panico a todos los administradores.
 *
 * Se envia por Expo Push (APNs/FCM por dentro).
 *
 * REQUISITO DE PLAN: Cloud Functions y las llamadas salientes a exp.host
 * necesitan el plan Blaze.
 */
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onValueWritten } from 'firebase-functions/v2/database';
import * as admin from 'firebase-admin';
import { SYSTEM_SENDER } from './alerts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface Aviso {
  titulo: string;
  cuerpo: string;
}

// Cada aviso existe en los dos idiomas de la app. Se elige por el idioma
// guardado en el perfil del destinatario (users/{uid}.language, lo escribe el
// selector EN | ES de la app); sin dato, espanol.
type Idioma = 'es' | 'en';
type Bilingue = Record<Idioma, Aviso>;

/** Que se le dice a cada parte cuando la reserva entra a cada estado. */
const MENSAJES: Record<string, { cliente?: Bilingue; escolta?: Bilingue }> = {
  confirmed: {
    cliente: {
      es: { titulo: 'Reserva confirmada', cuerpo: 'Recibimos su pago y su servicio de protección quedó confirmado.' },
      en: { titulo: 'Booking confirmed', cuerpo: 'Your payment went through and your protection is confirmed.' },
    },
    escolta: {
      es: { titulo: 'Nuevo servicio', cuerpo: 'Tiene un servicio confirmado. Acéptelo o recházelo en la app.' },
      en: { titulo: 'New job', cuerpo: 'You have a confirmed job. Accept or decline it in the app.' },
    },
  },
  accepted: {
    cliente: {
      es: { titulo: 'Escolta asignado', cuerpo: 'Su escolta aceptó el servicio.' },
      en: { titulo: 'Protector assigned', cuerpo: 'Your protector accepted the job.' },
    },
  },
  rejected: {
    cliente: {
      es: { titulo: 'Escolta no disponible', cuerpo: 'Su escolta no pudo tomar el servicio. Elija otro en la app.' },
      en: { titulo: 'Protector unavailable', cuerpo: "Your protector couldn't take the job. Choose another in the app." },
    },
  },
  en_route: {
    cliente: {
      es: { titulo: 'Su escolta va en camino', cuerpo: 'Puede seguir su ubicación en la app.' },
      en: { titulo: 'Your protector is on the way', cuerpo: 'Follow their location live in the app.' },
    },
  },
  active: {
    cliente: {
      es: { titulo: 'Servicio iniciado', cuerpo: 'Su servicio de protección comenzó.' },
      en: { titulo: 'Service started', cuerpo: 'Your protection service has started.' },
    },
    escolta: {
      es: { titulo: 'Servicio iniciado', cuerpo: 'Registró el inicio del servicio.' },
      en: { titulo: 'Service started', cuerpo: 'You started the service.' },
    },
  },
  completed: {
    cliente: {
      es: { titulo: 'Servicio terminado', cuerpo: 'Su servicio terminó. Puede calificar a su escolta.' },
      en: { titulo: 'Service complete', cuerpo: 'Your service has ended. You can rate your protector.' },
    },
    escolta: {
      es: { titulo: 'Servicio terminado', cuerpo: 'El servicio quedó cerrado. Su pago entra al proceso de liquidación.' },
      en: { titulo: 'Service complete', cuerpo: 'The job is closed. Your payout is now being processed.' },
    },
  },
  cancelled: {
    cliente: {
      es: { titulo: 'Reserva cancelada', cuerpo: 'Su reserva fue cancelada.' },
      en: { titulo: 'Booking cancelled', cuerpo: 'Your booking was cancelled.' },
    },
    escolta: {
      es: { titulo: 'Servicio cancelado', cuerpo: 'Se canceló un servicio que tenía asignado.' },
      en: { titulo: 'Job cancelled', cuerpo: 'A job assigned to you was cancelled.' },
    },
  },
};

/**
 * Avisos que la app puede encolar (coleccion `notifications`). El texto lo
 * pone siempre el servidor: nunca se reenvia lo que escribio el cliente.
 */
const PLANTILLAS: Record<string, Bilingue> = {
  booking_created: {
    es: { titulo: 'Reserva creada', cuerpo: 'Su solicitud de reserva quedó registrada.' },
    en: { titulo: 'Booking created', cuerpo: 'Your booking request was received.' },
  },
  booking_confirmed: {
    es: { titulo: 'Reserva confirmada', cuerpo: 'Su servicio de protección quedó confirmado.' },
    en: { titulo: 'Booking confirmed', cuerpo: 'Your protection service is confirmed.' },
  },
  booking_accepted: {
    es: { titulo: 'Reserva aceptada', cuerpo: 'Su escolta aceptó el servicio.' },
    en: { titulo: 'Booking accepted', cuerpo: 'Your protector accepted the job.' },
  },
  booking_rejected: {
    es: { titulo: 'Reserva rechazada', cuerpo: 'El escolta no pudo tomar el servicio. Elija otro en la app.' },
    en: { titulo: 'Booking declined', cuerpo: "The protector couldn't take the job. Choose another in the app." },
  },
  booking_cancelled: {
    es: { titulo: 'Reserva cancelada', cuerpo: 'Se canceló una reserva en la que participa.' },
    en: { titulo: 'Booking cancelled', cuerpo: "A booking you're part of was cancelled." },
  },
  booking_reassigned: {
    es: { titulo: 'Nuevo servicio', cuerpo: 'Se le asignó un servicio. Revíselo en la app.' },
    en: { titulo: 'New job', cuerpo: 'A job was assigned to you. Review it in the app.' },
  },
  new_booking_request: {
    es: { titulo: 'Nuevo servicio', cuerpo: 'Tiene una nueva solicitud de servicio. Revísela en la app.' },
    en: { titulo: 'New job', cuerpo: 'You have a new job request. Review it in the app.' },
  },
  guard_en_route: {
    es: { titulo: 'Su escolta va en camino', cuerpo: 'Puede seguir su ubicación en la app.' },
    en: { titulo: 'Your protector is on the way', cuerpo: 'Follow their location live in the app.' },
  },
  service_started: {
    es: { titulo: 'Servicio iniciado', cuerpo: 'Su servicio de protección comenzó.' },
    en: { titulo: 'Service started', cuerpo: 'Your protection service has started.' },
  },
  service_completed: {
    es: { titulo: 'Servicio terminado', cuerpo: 'El servicio terminó. Puede calificarlo en la app.' },
    en: { titulo: 'Service complete', cuerpo: 'The service has ended. You can rate it in the app.' },
  },
  new_message: {
    es: { titulo: 'Nuevo mensaje', cuerpo: 'Tiene un mensaje nuevo sobre su reserva.' },
    en: { titulo: 'New message', cuerpo: 'You have a new message about your booking.' },
  },
  payment_success: {
    es: { titulo: 'Pago recibido', cuerpo: 'Su pago se procesó correctamente.' },
    en: { titulo: 'Payment received', cuerpo: 'Your payment went through.' },
  },
  payment_failed: {
    es: { titulo: 'Pago no procesado', cuerpo: 'No se pudo procesar su pago. Revise su método de pago.' },
    en: { titulo: 'Payment failed', cuerpo: "We couldn't process your payment. Check your payment method." },
  },
  emergency: {
    es: { titulo: 'ALERTA DE EMERGENCIA', cuerpo: 'Se activó una alerta de emergencia en su reserva. Abra la app.' },
    en: { titulo: 'EMERGENCY ALERT', cuerpo: 'An emergency alert was raised on your booking. Open the app.' },
  },
};

/** Idioma del destinatario segun su perfil; espanol si no hay dato. */
async function idiomaDe(userId: string): Promise<Idioma> {
  try {
    const snap = await admin.firestore().collection('users').doc(userId).get();
    return snap.get('language') === 'en' ? 'en' : 'es';
  } catch {
    return 'es';
  }
}

async function tokensDe(userId: string): Promise<string[]> {
  if (!userId) return [];
  const snap = await admin.firestore().collection('deviceTokens').where('userId', '==', userId).get();
  const tokens = snap.docs
    .map((d) => d.data().token as string | undefined)
    .filter((t): t is string => typeof t === 'string' && t.startsWith('ExponentPushToken'));
  return Array.from(new Set(tokens));
}

/**
 * Entrega a Expo. Devuelve los tokens que Expo reporta como muertos para que
 * el llamador los limpie.
 */
async function enviarAExpo(
  tokens: string[],
  aviso: Aviso,
  datos: Record<string, unknown>
): Promise<{ enviados: number; tokensMuertos: string[] }> {
  if (tokens.length === 0) return { enviados: 0, tokensMuertos: [] };

  const mensajes = tokens.map((to) => ({
    to,
    title: aviso.titulo,
    body: aviso.cuerpo,
    data: datos,
    sound: 'default',
    priority: 'high',
    channelId: 'default',
  }));

  const respuesta = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(mensajes),
  });

  if (!respuesta.ok) {
    console.error('[Avisos] Expo respondio HTTP', respuesta.status);
    return { enviados: 0, tokensMuertos: [] };
  }

  const cuerpo = (await respuesta.json()) as { data?: Array<{ status: string; details?: { error?: string } }> };
  const resultados = cuerpo.data ?? [];
  const tokensMuertos: string[] = [];
  let enviados = 0;

  resultados.forEach((r, i) => {
    if (r.status === 'ok') { enviados++; return; }
    if (r.details?.error === 'DeviceNotRegistered') tokensMuertos.push(tokens[i]);
    console.warn('[Avisos] Expo rechazo un envio:', r.details?.error ?? r.status);
  });

  return { enviados, tokensMuertos };
}

async function limpiarTokens(tokensMuertos: string[]): Promise<void> {
  if (tokensMuertos.length === 0) return;
  const db = admin.firestore();
  for (const token of tokensMuertos) {
    const snap = await db.collection('deviceTokens').where('token', '==', token).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
}

/**
 * Deja constancia en `notifications` para la campana dentro de la app, con
 * status 'sent' (si quedara 'pending', enviarAvisoEncolado lo mandaria otra vez).
 */
async function registrarEnApp(userId: string, tipo: string, aviso: Aviso, datos: Record<string, unknown>): Promise<void> {
  await admin.firestore().collection('notifications').add({
    userId,
    senderId: SYSTEM_SENDER,
    type: tipo,
    title: aviso.titulo,
    body: aviso.cuerpo,
    data: datos,
    status: 'sent',
    read: false,
    createdAt: new Date().toISOString(),
  });
}

async function notificarA(
  userId: string,
  tipo: string,
  avisos: Bilingue,
  datos: Record<string, unknown>
): Promise<void> {
  if (!userId) return;
  const aviso = avisos[await idiomaDe(userId)];
  const tokens = await tokensDe(userId);
  const { enviados, tokensMuertos } = await enviarAExpo(tokens, aviso, datos);
  await limpiarTokens(tokensMuertos);
  await registrarEnApp(userId, tipo, aviso, datos);
  console.log(`[Avisos] ${userId}: ${enviados} de ${tokens.length} aparatos`);
}

/**
 * 1) Cambio de estado de una reserva en Realtime Database.
 * Corre con Admin SDK: no depende de que la app de nadie este abierta.
 */
export const avisarCambioDeReserva = onValueWritten('/bookings/{bookingId}', async (event) => {
  const antes = event.data.before.val() as Record<string, any> | null;
  const despues = event.data.after.val() as Record<string, any> | null;
  if (!despues) return;

  const estadoAnterior = (antes?.status as string | undefined) ?? null;
  const estadoNuevo = despues.status as string | undefined;
  if (!estadoNuevo || estadoAnterior === estadoNuevo) return;

  const plantilla = MENSAJES[estadoNuevo];
  if (!plantilla) return;

  const datos = {
    tipo: 'booking_status',
    bookingId: event.params.bookingId,
    estado: estadoNuevo,
    estadoAnterior,
  };

  // Un escolta nunca recibe avisos de reservas sin pagar.
  const pendientes: Promise<void>[] = [];
  if (plantilla.cliente && despues.clientId) {
    pendientes.push(notificarA(despues.clientId, 'booking_status', plantilla.cliente, datos));
  }
  if (plantilla.escolta && despues.guardId && estadoNuevo !== 'pending') {
    pendientes.push(notificarA(despues.guardId, 'booking_status', plantilla.escolta, datos));
  }

  const r = await Promise.allSettled(pendientes);
  r.filter((x) => x.status === 'rejected').forEach((x) =>
    console.error('[Avisos] Fallo un envio:', (x as PromiseRejectedResult).reason)
  );
});

/**
 * 2) Vacia la cola `notifications`.
 * Las reglas de Firestore ya garantizan que senderId == quien escribe y que
 * el destinatario es uno mismo o la otra parte de una reserva compartida.
 */
export const enviarAvisoEncolado = onDocumentCreated('notifications/{notificationId}', async (event) => {
  const doc = event.data;
  const datos = doc?.data();
  if (!doc || !datos || datos.status !== 'pending') return;

  const userId = datos.userId as string | undefined;
  if (!userId) {
    await doc.ref.update({ status: 'failed', error: 'sin userId' });
    return;
  }

  const tipo = typeof datos.type === 'string' ? datos.type : '';
  const delServidor = datos.senderId === SYSTEM_SENDER;
  const aviso: Aviso | undefined = delServidor
    ? { titulo: String(datos.title ?? 'Escolta Pro'), cuerpo: String(datos.body ?? '') }
    : PLANTILLAS[tipo]?.[await idiomaDe(userId)];

  if (!aviso) {
    await doc.ref.update({ status: 'failed', error: `tipo sin plantilla: ${tipo}` });
    return;
  }

  // Nunca se reenvian datos arbitrarios del cliente dentro del push.
  const payload: Record<string, unknown> = delServidor
    ? ((datos.data ?? {}) as Record<string, unknown>)
    : { type: tipo, bookingId: typeof datos.bookingId === 'string' ? datos.bookingId : null };

  try {
    const tokens = await tokensDe(userId);
    const { enviados, tokensMuertos } = await enviarAExpo(tokens, aviso, payload);
    await limpiarTokens(tokensMuertos);
    await doc.ref.update({
      // Lo que ve la campana dentro de la app es la plantilla, no el texto del cliente.
      title: aviso.titulo,
      body: aviso.cuerpo,
      status: enviados > 0 ? 'sent' : 'no_devices',
      sentAt: new Date().toISOString(),
      deliveredTo: enviados,
    });
  } catch (error: any) {
    console.error('[Avisos] Error vaciando la cola:', error);
    await doc.ref.update({ status: 'failed', error: String(error?.message ?? error) });
  }
});

/**
 * 3) Alerta de panico: avisa a todos los administradores desde el servidor.
 */
export const avisarEmergencia = onDocumentCreated('emergencyAlerts/{alertId}', async (event) => {
  const alerta = event.data?.data();
  if (!alerta) return;

  const admins = await admin.firestore().collection('users').where('role', '==', 'admin').get();
  if (admins.empty) {
    console.error('[Avisos] ALERTA DE EMERGENCIA SIN DESTINATARIO: no hay ningun administrador');
    return;
  }

  const tipoAlerta = typeof alerta.type === 'string' ? alerta.type.slice(0, 40) : '';
  const direccion = typeof alerta.location?.address === 'string' ? alerta.location.address.slice(0, 120) : '';
  const avisos: Bilingue = {
    es: {
      titulo: 'ALERTA DE EMERGENCIA',
      cuerpo: `Se activó una alerta${tipoAlerta ? ` de tipo ${tipoAlerta}` : ''}${direccion ? ` en ${direccion}` : ''}.`,
    },
    en: {
      titulo: 'EMERGENCY ALERT',
      cuerpo: `Emergency alert raised${tipoAlerta ? ` (${tipoAlerta})` : ''}${direccion ? ` at ${direccion}` : ''}.`,
    },
  };
  const datos = {
    tipo: 'emergency',
    alertId: event.params.alertId,
    bookingId: alerta.bookingId ?? null,
    userId: alerta.userId ?? null,
  };

  const r = await Promise.allSettled(admins.docs.map((d) => notificarA(d.id, 'emergency', avisos, datos)));
  r.filter((x) => x.status === 'rejected').forEach((x) =>
    console.error('[Avisos] Fallo avisar a un admin:', (x as PromiseRejectedResult).reason)
  );
});
