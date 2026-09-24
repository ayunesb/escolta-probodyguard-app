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

/** Que se le dice a cada parte cuando la reserva entra a cada estado. */
const MENSAJES: Record<string, { cliente?: Aviso; escolta?: Aviso }> = {
  confirmed: {
    cliente: { titulo: 'Reserva confirmada', cuerpo: 'Tu pago se recibio y tu servicio de proteccion quedo confirmado.' },
    escolta: { titulo: 'Nuevo servicio', cuerpo: 'Tienes un servicio confirmado. Aceptalo o rechazalo en la app.' },
  },
  accepted: {
    cliente: { titulo: 'Escolta asignado', cuerpo: 'Tu escolta acepto el servicio.' },
  },
  rejected: {
    cliente: { titulo: 'Escolta no disponible', cuerpo: 'Tu escolta no pudo tomar el servicio. Elige otro en la app.' },
  },
  en_route: {
    cliente: { titulo: 'Tu escolta va en camino', cuerpo: 'Puedes seguir su ubicacion en la app.' },
  },
  active: {
    cliente: { titulo: 'Servicio iniciado', cuerpo: 'Tu servicio de proteccion comenzo.' },
    escolta: { titulo: 'Servicio iniciado', cuerpo: 'Registraste el inicio del servicio.' },
  },
  completed: {
    cliente: { titulo: 'Servicio terminado', cuerpo: 'Tu servicio termino. Puedes calificar a tu escolta.' },
    escolta: { titulo: 'Servicio terminado', cuerpo: 'El servicio quedo cerrado. Tu pago entra al proceso de liquidacion.' },
  },
  cancelled: {
    cliente: { titulo: 'Reserva cancelada', cuerpo: 'Tu reserva fue cancelada.' },
    escolta: { titulo: 'Servicio cancelado', cuerpo: 'Se cancelo un servicio que tenias asignado.' },
  },
};

/**
 * Plantillas para los avisos que encolan los clientes. La llave es `type`.
 * El texto del cliente (title/body) se ignora siempre.
 */
const PLANTILLAS: Record<string, Aviso> = {
  booking_created: { titulo: 'Reserva creada', cuerpo: 'Tu solicitud de reserva se registro.' },
  booking_confirmed: { titulo: 'Reserva confirmada', cuerpo: 'Tu servicio de proteccion quedo confirmado.' },
  booking_accepted: { titulo: 'Reserva aceptada', cuerpo: 'Tu escolta acepto el servicio.' },
  booking_rejected: { titulo: 'Reserva rechazada', cuerpo: 'El escolta no pudo tomar el servicio. Elige otro en la app.' },
  booking_cancelled: { titulo: 'Reserva cancelada', cuerpo: 'Una reserva en la que participas fue cancelada.' },
  booking_reassigned: { titulo: 'Nuevo servicio', cuerpo: 'Se te asigno un servicio. Revisalo en la app.' },
  new_booking_request: { titulo: 'Nuevo servicio', cuerpo: 'Tienes una nueva solicitud de servicio. Revisala en la app.' },
  guard_en_route: { titulo: 'Tu escolta va en camino', cuerpo: 'Puedes seguir su ubicacion en la app.' },
  service_started: { titulo: 'Servicio iniciado', cuerpo: 'Tu servicio de proteccion comenzo.' },
  service_completed: { titulo: 'Servicio terminado', cuerpo: 'El servicio termino. Puedes calificarlo en la app.' },
  new_message: { titulo: 'Nuevo mensaje', cuerpo: 'Tienes un mensaje nuevo sobre tu reserva.' },
  payment_success: { titulo: 'Pago recibido', cuerpo: 'Tu pago se proceso correctamente.' },
  payment_failed: { titulo: 'Pago no procesado', cuerpo: 'No se pudo procesar tu pago. Revisa tu metodo de pago.' },
  emergency: { titulo: 'ALERTA DE EMERGENCIA', cuerpo: 'Se activo una alerta de emergencia en tu reserva. Abre la app.' },
};

/** Todos los tokens de Expo registrados por un usuario (puede tener varios aparatos). */
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

async function notificarA(userId: string, tipo: string, aviso: Aviso, datos: Record<string, unknown>): Promise<void> {
  if (!userId) return;
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
    : PLANTILLAS[tipo];

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
  const aviso: Aviso = {
    titulo: 'ALERTA DE EMERGENCIA',
    cuerpo: `Se activo una alerta${tipoAlerta ? ` de tipo ${tipoAlerta}` : ''}${direccion ? ` en ${direccion}` : ''}.`,
  };
  const datos = {
    tipo: 'emergency',
    alertId: event.params.alertId,
    bookingId: alerta.bookingId ?? null,
    userId: alerta.userId ?? null,
  };

  const r = await Promise.allSettled(admins.docs.map((d) => notificarA(d.id, 'emergency', aviso, datos)));
  r.filter((x) => x.status === 'rejected').forEach((x) =>
    console.error('[Avisos] Fallo avisar a un admin:', (x as PromiseRejectedResult).reason)
  );
});
