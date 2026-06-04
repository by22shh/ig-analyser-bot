export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86400000);
}
