import type { Destination } from '@/lib/data';

/** Resolve both decoded route params and the encoded params returned by App Router. */
export function destinationFromRoute(catalog: readonly Destination[], routeId: string | undefined): Destination | undefined {
  if (routeId === undefined) return undefined;
  const match = (id: string) => catalog.find((destination) => destination.id === id || destination.name === id);
  // A literal percent-encoded ID must retain priority over another record's decoded name.
  const exact = match(routeId);
  if (exact) return exact;
  try {
    return match(decodeURIComponent(routeId));
  } catch {
    // An invalid escape is not a reason to crash the entire destination page.
    return undefined;
  }
}
