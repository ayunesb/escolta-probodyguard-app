import { calendarDays } from '../calendar';
import { bookingStart, toDateInputValue, toTimeInputValue } from '../../components/funnel/format';
describe('local booking calendar', () => {
  it.each([[2028,1,29],[2027,1,28],[2026,3,30],[2026,0,31]])('renders every day of %s/%s', (year,month,count) => {
    const cells=calendarDays(year,month);const days=cells.filter((d): d is Date=>!!d);
    expect(days).toHaveLength(count);expect(cells.findIndex(Boolean)).toBe(new Date(year,month,1).getDay());
    expect(days.map(d=>d.getDate())).toEqual(Array.from({length:count},(_,i)=>i+1));
  });
  it('crosses year boundaries without skipping a month',()=>{
    expect(toDateInputValue(calendarDays(2026,12).find(Boolean)!)).toBe('2027-01-01');
  });
  it('preserves the local day/time and handles a service ending next day',()=>{
    const date=new Date(2027,0,31,23,30);const start=bookingStart({scheduledDate:toDateInputValue(date),scheduledTime:toTimeInputValue(date)});
    expect(start?.getTime()).toBe(date.getTime());const end=new Date(start!.getTime()+4*3600000);
    expect(toDateInputValue(end)).toBe('2027-02-01');expect(toTimeInputValue(end)).toBe('03:30');
  });
});
