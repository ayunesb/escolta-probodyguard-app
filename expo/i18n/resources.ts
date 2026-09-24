import enCommon from './locales/en/common';
import enAuth from './locales/en/auth';
import enNav from './locales/en/nav';
import enFunnel from './locales/en/funnel';
import enBooking from './locales/en/booking';
import enBackoffice from './locales/en/backoffice';
import enAccount from './locales/en/account';
import esCommon from './locales/es/common';
import esAuth from './locales/es/auth';
import esNav from './locales/es/nav';
import esFunnel from './locales/es/funnel';
import esBooking from './locales/es/booking';
import esBackoffice from './locales/es/backoffice';
import esAccount from './locales/es/account';

export const defaultNS = 'common';

export const resources = {
  en: {
    common: enCommon,
    auth: enAuth,
    nav: enNav,
    funnel: enFunnel,
    booking: enBooking,
    backoffice: enBackoffice,
    account: enAccount,
  },
  es: {
    common: esCommon,
    auth: esAuth,
    nav: esNav,
    funnel: esFunnel,
    booking: esBooking,
    backoffice: esBackoffice,
    account: esAccount,
  },
} as const;
