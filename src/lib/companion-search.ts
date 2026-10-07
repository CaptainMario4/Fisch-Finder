import type { Companion } from './companions';
export type CompanionFilters = { region: string; event: string; source: string; ability: string; status: string };
export const companionFilterDefaults: CompanionFilters = { region: '', event: '', source: '', ability: '', status: '' };
export const companionFilterLabels: Record<keyof CompanionFilters, string> = { region: 'Location', event: 'Event', source: 'Obtainment', ability: 'Ability type', status: 'Availability' };
export const companionSorts = ['name-asc', 'name-desc', 'region-asc', 'source-asc'] as const;
export const companionAbilityTypes = (companion: Companion) => [...new Set(companion.abilities.map(ability => ability.group))];
const searchText = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
export function companionFilterOptions(companions: Companion[]) {
  const values = (key: 'region' | 'event' | 'source') => [...new Set(companions.map(companion => companion[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return { region: values('region'), event: values('event'), source: values('source'), ability: [...new Set(companions.flatMap(companionAbilityTypes))].sort((a, b) => a.localeCompare(b)) };
}
export function findCompanions(companions: Companion[], query: string, filters: CompanionFilters, sort: string): Companion[] {
  const needle = searchText(query);
  return companions.filter(companion => {
    if (needle && ![companion.name, companion.region, companion.event, companion.source, companion.food, companion.description, ...companion.obtainment, ...companion.abilities.flatMap(ability => [ability.group, ability.text, ...ability.details, ...ability.notes]), ...companion.buffs.map(buff => `${buff.food} ${buff.effect}`)].some(value => searchText(value).includes(needle))) return false;
    for (const key of ['region', 'event', 'source'] as const) if (filters[key] === '__none__' ? Boolean(companion[key]) : filters[key] && filters[key] !== companion[key]) return false;
    if (filters.ability === '__none__' ? companion.abilities.length > 0 : filters.ability && !companionAbilityTypes(companion).some(group => group === filters.ability)) return false;
    return !(filters.status === 'available' && companion.unavailable || filters.status === 'unavailable' && !companion.unavailable);
  }).sort((a, b) => (sort === 'name-desc' ? b.name.localeCompare(a.name) : sort === 'region-asc' ? a.region.localeCompare(b.region) : sort === 'source-asc' ? a.source.localeCompare(b.source) : 0) || a.name.localeCompare(b.name));
}
