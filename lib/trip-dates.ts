function utcDay(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const stamp = Date.UTC(year, month - 1, day);
  const date = new Date(stamp);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? stamp : null;
}

export function tripDuration(arrival: string, departure: string) {
  const start = utcDay(arrival);
  const end = utcDay(departure);
  if (start === null || end === null) return null;
  const nights = Math.round((end - start) / 86_400_000);
  return nights >= 1 && nights <= 30 ? { nights, days: nights + 1 } : null;
}

export function departureForNights(arrival: string, nights: number) {
  const start = utcDay(arrival);
  if (start === null || !Number.isInteger(nights) || nights < 1 || nights > 30) return null;
  return new Date(start + nights * 86_400_000).toISOString().slice(0, 10);
}
