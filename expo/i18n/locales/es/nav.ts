import type en from '../en/nav';
import type { Translation } from '../../types';

const nav: Translation<typeof en> = {
  tabs: {
    protect: 'Proteger',
    bookings: 'Reservas',
    account: 'Cuenta',
    jobs: 'Servicios',
    history: 'Historial',
    overview: 'Resumen',
    roster: 'Plantilla',
    verification: 'Validación',
    members: 'Miembros',
  },
  notFound: {
    code: 'Error 404',
    title: 'Esta página no existe',
    message: 'Es posible que el enlace haya caducado o que la página se haya movido. Su cuenta y sus reservas están a salvo.',
    screenTitle: 'Página no encontrada',
    goHome: 'Ir a mi inicio',
    goSignIn: 'Ir a iniciar sesión',
  },
};

export default nav;
