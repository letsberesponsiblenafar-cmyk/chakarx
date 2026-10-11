/** Shared date eligibility for recommendations and visit allocation. */
export function seasonMatches(season: string, date: string): boolean | null {
  const value = season.toLowerCase();
  const month = new Date(`${date}T12:00:00`).getMonth() + 1;
  if (value === 'all') return true;
  if (value.includes('spring-autumn')) return month >= (value.includes('late-spring') ? 5 : 3) && month <= 11;
  const months: Record<string, number[]> = { winter: [12, 1, 2], spring: [3, 4, 5], summer: [6, 7, 8], autumn: [9, 10, 11] };
  const named = Object.keys(months).filter((name) => value.includes(name));
  return named.length ? named.some((name) => months[name].includes(month)) : null;
}
