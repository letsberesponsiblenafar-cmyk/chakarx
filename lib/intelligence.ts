import registry from '@/data/itinerary-intelligence.json';
import { destinationByName } from '@/lib/data';

type Priority = 'CORE' | 'SECONDARY' | 'OFFBEAT' | 'LOW_PRIORITY' | 'TREK_ONLY';
type RoutePreference = 'PREFERRED' | 'ALLOWED' | 'AVOID' | 'NOT_ALLOWED';
export type IntelligenceStatus = 'STANDARD' | 'OPTIONAL' | 'CONDITIONAL' | 'EXTRA' | 'EXCLUDED' | 'SEASONAL' | 'LIVE_CHECK';
const priorityRows = registry.enginePriorityGuide as Array<{ priority: string; weight_range: string | number; engine_behavior: string }>;
const destinationRows = registry.destinations as Array<any>;
const additionalRows = registry.additionalDestinations as Array<any>;
const routeRows = registry.routeTemplates as Array<any>;
const sightRows = [...(registry.sightseeing as any[]), ...(registry.sightseeingExpanded as any[])];
const activityRows = [...(registry.activities as any[]), ...(registry.activitiesExpanded as any[])];
function normalize(value: string) { return value.trim().toLowerCase().replace(/[–—]/g, '-'); }
export function destinationPriority(name: string): Priority {
  const row = destinationRows.find((x) => normalize(x.destination_name) === normalize(name));
  if (row?.engine_priority) return row.engine_priority as Priority;
  const add = additionalRows.find((x) => normalize(String(x.destination_name).split(' / ')[0]) === normalize(name));
  if (add?.priority) return add.priority as Priority;
  const d = destinationByName(name);
  if (d?.tier === 'Iconic' || d?.tier === 'Established') return 'CORE';
  if (d?.tier === 'Secondary') return 'SECONDARY';
  if (d?.tier === 'Offbeat') return 'OFFBEAT';
  return 'LOW_PRIORITY';
}
export function recommendationWeight(name: string) {
  const row = destinationRows.find((x) => normalize(x.destination_name) === normalize(name));
  if (typeof row?.recommendation_weight === 'number') return row.recommendation_weight;
  const add = additionalRows.find((x) => normalize(String(x.destination_name).split(' / ')[0]) === normalize(name));
  if (typeof add?.recommendation_weight === 'number') return add.recommendation_weight;
  const p = destinationPriority(name);
  return p === 'CORE' ? 100 : p === 'SECONDARY' ? 45 : p === 'OFFBEAT' ? 20 : p === 'LOW_PRIORITY' ? 10 : 0;
}
export type RouteRuleDecision = { preference: RoutePreference; vehicleDays: number; reason: string; access?: string; season?: string; preferredAlternative?: string; rationale?: string };

export function routeRule(from: string, to: string): RouteRuleDecision {
  if (from === to) return { preference: 'ALLOWED', vehicleDays: 0, reason: 'No destination movement.', rationale: 'No destination movement.' };
  const row = routeRows.find((x) => normalize(x.from_name) === normalize(from) && normalize(x.to_name) === normalize(to));
  if (row) return { preference: (row.routing_preference || 'ALLOWED') as RoutePreference, vehicleDays: Number(row.vehicle_days_charged || 1), reason: row.recommended_reason || 'Stored route template.', access: row.access_rule || undefined, season: row.season_rule || undefined };
  return { preference: 'ALLOWED', vehicleDays: 1, reason: 'No dedicated route template; live routing comparison required.', access: 'LIVE_CHECK', rationale: 'No dedicated route template; live routing comparison required.' };
}
export function routePreference(from: string, to: string) { return routeRule(from, to).preference; }
export function routeDecision(from: string, to: string): RouteRuleDecision & { rationale: string } {
  const direct = routeRule(from, to);
  if (direct.preference === 'AVOID' && from !== 'Srinagar' && to !== 'Srinagar') return { ...direct, preferredAlternative: `${from} → Srinagar → ${to}`, rationale: `${from} → ${to} is an AVOID-by-default cross-valley transfer. Compare the Srinagar-hub alternative before confirmation.` };
  return { ...direct, rationale: direct.reason };
}
export function isGurezAllowed(date: string) { const month = new Date(`${date}T12:00:00`).getMonth() + 1; return month >= 5 && month <= 10; }
export function destinationAccessFlags(name: string) {
  const d = destinationByName(name); const flags: IntelligenceStatus[] = [];
  if (name === 'Gurez') flags.push('SEASONAL', 'LIVE_CHECK');
  if (name === 'Daksum') flags.push('LIVE_CHECK');
  if (d?.access?.toLowerCase().includes('weather')) flags.push('CONDITIONAL');
  if (d?.access?.toLowerCase().includes('security')) flags.push('LIVE_CHECK');
  return [...new Set(flags)];
}
export function sightseeingRule(destination: string, name: string) {
  const row = sightRows.find((x) => normalize(String(x.name || '')) === normalize(name));
  if (!row) return { status: 'STANDARD' as IntelligenceStatus, extraCost: false, notes: 'Stored destination-library sightseeing.' };
  const status = String(row.status || 'STANDARD').toUpperCase();
  return { status: (status === 'MANDATORY' ? 'STANDARD' : status) as IntelligenceStatus, extraCost: String(row.extra_cost).toUpperCase() === 'YES', notes: row.notes || '' };
}
export function activitiesFor(destination: string) {
  return activityRows.filter((x) => {
    const id = String(x.destination_id || '');
    const d = destinationRows.find((r) => String(r.destination_id) === id)?.destination_name;
    const a = additionalRows.find((r) => String(r.new_id) === id)?.destination_name;
    return normalize(String(d || a || '')) === normalize(destination);
  });
}
export function activityStatus(activity: any): IntelligenceStatus { return String(activity?.default_status || '').toUpperCase() === 'OPTIONAL' ? 'OPTIONAL' : String(activity?.default_status || '').toUpperCase() === 'EXCLUDED' ? 'EXCLUDED' : 'STANDARD'; }
export function engineRules() { return registry.engineRules as Array<{ id: string; rule: string }>; }
export function itineraryTemplates() { return registry.itineraryTemplates as Array<any>; }
export function templateFor(destination: string, nights: number, type: 'Day Trip' | 'Overnight' = 'Overnight') {
  const rows = itineraryTemplates().filter((x) => { const d = destinationRows.find((r) => r.destination_id === x.destination_id)?.destination_name; return normalize(String(d || '')) === normalize(destination) && String(x.template_type) === type; });
  return rows.sort((a, b) => Math.abs(Number(a.nights || 0) - nights) - Math.abs(Number(b.nights || 0) - nights))[0] || null;
}
export function shouldPreferOffbeat(input: { interests: string[]; nights: number }) { const interests = input.interests.map(normalize); return input.nights >= 6 || interests.some((x) => ['offbeat', 'quiet', 'slow travel', 'nature', 'photography'].includes(x)); }
