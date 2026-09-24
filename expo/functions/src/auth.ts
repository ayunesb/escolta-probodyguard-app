/**
 * Autenticacion de las rutas HTTP (Express) con el ID token de Firebase.
 *
 * Antes las rutas de pago no pedian ninguna credencial: cualquiera podia
 * cobrar cualquier importe, reembolsar transacciones ajenas o listar las
 * tarjetas guardadas de otro usuario con solo conocer su uid.
 */
import type { NextFunction, Request, Response } from 'express';
import * as admin from 'firebase-admin';

export interface AuthedRequest extends Request {
  uid?: string;
}

function bearerToken(req: Request): string | null {
  const header = String(req.headers.authorization ?? '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/** Exige `Authorization: Bearer <Firebase ID token>` y deja el uid en req.uid. */
export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Missing Authorization bearer token' } });
    return;
  }
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.uid = decoded.uid;
    next();
  } catch {
    res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Invalid or expired ID token' } });
  }
}

/** Rol del perfil en Firestore. Las reglas impiden que un no-admin lo cambie. */
export async function roleOf(uid: string): Promise<string | null> {
  const snap = await admin.firestore().doc(`users/${uid}`).get();
  const role = snap.exists ? snap.get('role') : null;
  return typeof role === 'string' ? role : null;
}

/** Va despues de requireAuth. */
export async function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  if (!req.uid || (await roleOf(req.uid)) !== 'admin') {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Admin only' } });
    return;
  }
  next();
}

/** Las rutas con :userId solo operan sobre el propio usuario. */
export function requireSelf(param: string) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.uid || req.params[param] !== req.uid) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You can only access your own payment methods' } });
      return;
    }
    next();
  };
}
