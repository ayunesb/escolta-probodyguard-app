import { useState } from 'react';
import { Clock } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/backoffice/Sheet';
import { Button } from '@/components/ui';
import Colors from '@/constants/colors';
import { Fonts } from '@/constants/design';
import { toTimeInputValue } from './format';

// An explicit local-time selector is consistent across Safari, desktop and mobile.
export function WebTimeField({ value, onChange }: { value: Date; onChange: (date: Date) => void }) {
  const { t, i18n } = useTranslation(['funnel', 'common']);
  const [open, setOpen] = useState(false);
  const [hour, setHour] = useState(value.getHours());
  const [minute, setMinute] = useState(value.getMinutes());
  const spanish = i18n.language.startsWith('es');
  const style = { fontFamily: Fonts.regular, fontSize: 16, color: Colors.textPrimary, background: Colors.surface, border: `1px solid ${Colors.border}`, borderRadius: 8, minHeight: 48, padding: 10, width: '100%' };
  return <div style={{ flex: 1, minWidth: 0 }}>
    <button type="button" aria-label={t('schedule.startTime')} aria-expanded={open} onClick={() => { setHour(value.getHours()); setMinute(value.getMinutes()); setOpen(true); }} style={{ ...style, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
      <span>{toTimeInputValue(value)}</span><Clock size={17} color={Colors.accent} />
    </button>
    <Sheet visible={open} onClose={() => setOpen(false)} title={t('schedule.startTime')} footer={<Button title={t('common:actions.done')} onPress={() => { const next = new Date(value); next.setHours(hour, minute, 0, 0); onChange(next); setOpen(false); }} />}>
      <div style={{ display: 'flex', gap: 16, fontFamily: Fonts.regular, color: Colors.textSecondary }}>
        <label style={{ flex: 1 }}>{spanish ? 'Hora (24 h)' : 'Hour (24 h)'}
          <select aria-label={spanish ? 'Hora' : 'Hour'} value={hour} onChange={e => setHour(Number(e.target.value))} style={style}>
            {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, '0')}</option>)}
          </select>
        </label>
        <label style={{ flex: 1 }}>{spanish ? 'Minuto' : 'Minute'}
          <select aria-label={spanish ? 'Minuto' : 'Minute'} value={minute} onChange={e => setMinute(Number(e.target.value))} style={style}>
            {Array.from({ length: 60 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, '0')}</option>)}
          </select>
        </label>
      </div>
    </Sheet>
  </div>;
}
