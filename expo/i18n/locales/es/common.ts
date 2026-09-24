import type en from '../en/common';
import type { Translation } from '../../types';

const common: Translation<typeof en> = {
  actions: {
    cancel: 'Cancelar',
    save: 'Guardar',
    saving: 'Guardando…',
    tryAgain: 'Intentar de nuevo',
    back: 'Atrás',
    goBack: 'Regresar',
    close: 'Cerrar',
    continue: 'Continuar',
    done: 'Listo',
    confirm: 'Confirmar',
    edit: 'Editar',
    delete: 'Eliminar',
    retry: 'Reintentar',
    copy: 'Copiar',
    copied: 'Copiado',
    seeAll: 'Ver todo',
    signOut: 'Cerrar sesión',
    ok: 'Aceptar',
    goHome: 'Ir al inicio',
    dismiss: 'Descartar',
  },
  status: {
    pending: 'Pendiente',
    confirmed: 'Confirmada',
    accepted: 'Aceptada',
    rejected: 'Rechazada',
    en_route: 'En camino',
    active: 'En curso',
    completed: 'Completada',
    cancelled: 'Cancelada',
    unknown: 'Desconocido',
  },
  roles: {
    client: 'Cliente',
    guard: 'Escolta',
    company: 'Empresa',
    admin: 'Administrador',
  },
  errors: {
    generic: 'Algo salió mal. Inténtelo de nuevo.',
    network: 'Sin conexión. Revise su internet e inténtelo de nuevo.',
    permission: 'No tiene acceso a esto.',
    notFound: 'No encontrado.',
  },
  a11y: {
    showPassword: 'Mostrar contraseña',
    hidePassword: 'Ocultar contraseña',
  },
  loading: 'Cargando…',
  stillConnecting: 'Conectando…',
  language: {
    title: 'Idioma',
    description: 'Elija el idioma de la aplicación.',
    en: 'English',
    es: 'Español',
    switchTo: 'Cambiar idioma',
  },
  errorBoundary: {
    title: 'Algo salió mal',
    message: 'Tuvimos un problema inesperado. Sus reservas y pagos están a salvo; inténtelo de nuevo.',
    devOnly: 'Solo desarrollo',
  },
  units: {
    hours_one: '{{count}} hora',
    hours_other: '{{count}} horas',
    hoursShort: '{{count}} h',
    perHour: '/ h',
  },
  brand: {
    name: 'Escolta Pro',
    tagline: 'Protección ejecutiva',
  },
};

export default common;
