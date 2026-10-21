import { routeByName } from '@/lib/data';
import { routeDecision } from '@/lib/intelligence';
import type { RouteLeg } from '@/lib/itinerary';

export function routeLeg(from: string, to: string): RouteLeg {
  const policy = routeDecision(from, to);
  if (from === to) return { from, to, km: 0, hours: 0, source: 'No movement', live_required: false, known: true, preference: 'ALLOWED', vehicleDaysCharged: 0, rationale: policy.rationale };
  const direct = routeByName(from, to);
  const a = routeByName(from, 'Srinagar'); const b = routeByName('Srinagar', to);
  if (a && b && from !== 'Srinagar' && to !== 'Srinagar' && (!direct || policy.preference === 'AVOID')) return { from, to, via: ['Srinagar'], km: a.km + b.km, hours: a.hours + b.hours, hours_max: (a.hours_max || a.hours) + (b.hours_max || b.hours), access_minutes: (a.access_minutes || 0) + (b.access_minutes || 0), source: 'Composed from destination-library Srinagar legs', live_required: true, known: true, preference: policy.preference, vehicleDaysCharged: policy.vehicleDays, rationale: policy.rationale, preferredAlternative: policy.preferredAlternative };
  if (direct) return { ...direct, from, to, known: true, preference: policy.preference, vehicleDaysCharged: policy.vehicleDays, rationale: policy.rationale, preferredAlternative: policy.preferredAlternative };
  return { from, to, km: 0, hours: 0, source: 'Live routing required', live_required: true, known: false, preference: policy.preference, vehicleDaysCharged: policy.vehicleDays, rationale: policy.rationale, preferredAlternative: policy.preferredAlternative };
}

export function journeyDrive(from: string, to: string, visit?: string | null): RouteLeg {
  const direct = routeLeg(from, to);
  if (!visit || visit === to) return direct;
  const outward = routeLeg(from, visit); const onward = routeLeg(visit, to);
  return { ...direct, via: [...new Set([...(outward.via || []), ...(onward.via || [])])],
    km: outward.km + onward.km, hours: outward.hours + onward.hours,
    hours_max: (outward.hours_max || outward.hours) + (onward.hours_max || onward.hours),
    access_minutes: (outward.access_minutes || 0) + (onward.access_minutes || 0),
    source: `Day visit: ${from} → ${visit} → ${to}`, live_required: outward.live_required || onward.live_required,
    known: outward.known && onward.known,
    preference: outward.preference === 'NOT_ALLOWED' || onward.preference === 'NOT_ALLOWED' ? 'NOT_ALLOWED' : outward.preference === 'AVOID' || onward.preference === 'AVOID' ? 'AVOID' : outward.preference,
    vehicleDaysCharged: Math.max(1, outward.vehicleDaysCharged, onward.vehicleDaysCharged),
    rationale: `Day visit only. Overnight remains ${to}; next-day origin remains ${to}.`,
  };
}
