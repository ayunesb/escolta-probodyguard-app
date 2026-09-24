import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Sheet } from '@/components/backoffice/Sheet';
import Colors from '@/constants/colors';
import { Fonts } from '@/constants/design';
import { toDateInputValue } from './format';

import { calendarDays } from '@/utils/calendar';
export function WebDateField({ value, onChange }: { value: Date; onChange: (date: Date) => void }) {
  const { t, i18n } = useTranslation('funnel');
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));
  const locale = i18n.language.startsWith('es') ? 'es-MX' : 'en-US';
  const today = toDateInputValue(new Date());
  const buttonStyle = { border: `1px solid ${Colors.border}`, borderRadius: 8, color: Colors.textPrimary, background: Colors.surface, padding: 8, cursor: 'pointer', fontFamily: Fonts.regular };
  return <div style={{ flex: 1, minWidth: 0 }}>
    <button type="button" aria-label={t('schedule.dateA11y')} aria-expanded={open} onClick={() => { if (!open) setMonth(new Date(value.getFullYear(), value.getMonth(), 1)); setOpen(!open); }} style={{ ...buttonStyle, border: 'none', display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', minHeight: 50, gap: 8 }}>
      <span>{value.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' })}</span><Calendar size={17} color={Colors.accent} />
    </button>
    <Sheet visible={open} onClose={() => setOpen(false)} title={t('schedule.dateA11y')}><div role="group" aria-label={t('schedule.dateA11y')} onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }} style={{ paddingBottom: 12, minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button type="button" aria-label={locale === 'es-MX' ? 'Mes anterior' : 'Previous month'} disabled={month.getTime() <= new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()} style={buttonStyle} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={16} /></button>
        <span aria-live="polite" style={{ color: Colors.textPrimary, fontFamily: Fonts.regular, fontSize: 16, textAlign: 'center' }}>{month.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}</span>
        <button type="button" aria-label={locale === 'es-MX' ? 'Mes siguiente' : 'Next month'} style={buttonStyle} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={16} /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 2 }}>
        {Array.from({ length: 7 }, (_, day) => <span key={day} style={{ fontSize: 12, color: Colors.textSecondary, textAlign: 'center' }}>{new Date(2024, 0, 7 + day).toLocaleDateString(locale, { weekday: 'narrow' })}</span>)}
        {calendarDays(month.getFullYear(), month.getMonth()).map((date, i) => date ? <button key={i} type="button" aria-label={date.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' })} aria-pressed={toDateInputValue(date) === toDateInputValue(value)} disabled={toDateInputValue(date) < today} style={{ ...buttonStyle, minHeight: 42, padding: '6px 0', fontSize: 14, opacity: toDateInputValue(date) < today ? 0.25 : 1, background: toDateInputValue(date) === toDateInputValue(value) ? Colors.accent : Colors.surface, color: toDateInputValue(date) === toDateInputValue(value) ? Colors.background : Colors.textPrimary }} onClick={() => { const next = new Date(value); next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate()); onChange(next); setOpen(false); }}>{date.getDate()}</button> : <span key={i} />)}
      </div>
    </div></Sheet>
  </div>;
}
