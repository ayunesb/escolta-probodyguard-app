// Fechas, horas y numeros segun el idioma activo. Se leen en cada llamada, asi
// que al cambiar de idioma basta con volver a renderizar.
import { currentLanguage } from './index';

/** Locale para Intl/toLocale*: espanol de Mexico o ingles. */
export function dateLocale(): string {
  return currentLanguage() === 'es' ? 'es-MX' : 'en-GB';
}

export function formatDate(date: Date, options: Intl.DateTimeFormatOptions): string {
  return date.toLocaleDateString(dateLocale(), options);
}

export function formatTimeOfDay(date: Date): string {
  return date.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatDateTime(date: Date, options: Intl.DateTimeFormatOptions): string {
  return date.toLocaleString(dateLocale(), options);
}

export function formatNumber(n: number, options?: Intl.NumberFormatOptions): string {
  return n.toLocaleString(currentLanguage() === 'es' ? 'es-MX' : 'en-US', options);
}

/** Pone en mayuscula la primera letra (el espanol da "martes, 24 de septiembre"). */
export function capitalize(text: string): string {
  return text ? text.charAt(0).toLocaleUpperCase() + text.slice(1) : text;
}
