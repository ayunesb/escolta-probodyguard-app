/** Calendar cells use local dates. Navigation always constructs day 1. */
export function calendarDays(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  return [...Array(first.getDay()).fill(null), ...Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, i) => new Date(year, month, i + 1))];
}
