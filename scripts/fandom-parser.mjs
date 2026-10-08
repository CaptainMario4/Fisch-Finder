// Read-only secondary import. Unknown templates are rejected in structured fields;
// we never guess stats, preferences, stages, or catch methods from prose.
export const PARSER_VERSION = 1;
export function templates(value) {
  const result = []; let depth = 0, start = 0;
  for (let i = 0; i < value.length - 1; i++) {
    const pair = value.slice(i, i + 2);
    if (pair === '{{') { if (!depth) start = i; depth++; i++; }
    else if (pair === '}}' && depth) { depth--; i++; if (!depth) {
      const parts = split(value.slice(start + 2, i - 1));
      const name = parts.shift().trim().toLowerCase(), args = {}, positional = [];
      for (const part of parts) {
        const match = part.match(/^\s*([\w.-]+)\s*=([\s\S]*)$/);
        if (match) args[match[1].toLowerCase()] = match[2].trim(); else positional.push(part.trim());
      }
      result.push({ name, args, positional, start, end: i + 1 });
    }}
  }
  return result;
}
export function split(value, delimiter = '|') {
  const parts = []; let depth = 0, links = 0, start = 0;
  for (let i = 0; i < value.length; i++) {
    const pair = value.slice(i, i + 2);
    if (pair === '{{') { depth++; i++; } else if (pair === '}}') { depth--; i++; }
    else if (pair === '[[') { links++; i++; } else if (pair === ']]') { links--; i++; }
    else if (!depth && !links && value.slice(i, i + delimiter.length) === delimiter) {
      parts.push(value.slice(start, i)); start = i + delimiter.length; i += delimiter.length - 1;
    }
  }
  parts.push(value.slice(start)); return parts;
}
export function cleanText(input, title = '') {
  let value = String(input ?? '').replace(/<!--[\s\S]*?-->/g, '');
  for (const t of templates(value).reverse()) {
    const first = t.positional[0] ?? t.args['1'] ?? '';
    let replacement;
    if (t.name === 'pagename') replacement = title;
    else if (t.name === 'none') replacement = 'None';
    else if (['c$', 's$', 'e$'].includes(t.name)) replacement = t.name.toUpperCase() + (first ? ' ' + cleanText(first, title) : '');
    else if (['fish','rod','bait','mutation','enchantment','locationcolor','rarity','color','title','quote','cost','luck','lure speed','control','resilience','max kg','relic','textstyle'].includes(t.name)) replacement = cleanText(t.args.text ?? first, title);
    else if (/^(common|uncommon|unusual|rare|legendary|mythical|exotic|limited|event|secret|apex|extinct)f$/.test(t.name)) replacement = t.name.slice(0, -1);
    else if (['stub','main','reflist','clear','clr'].includes(t.name)) replacement = '';
    else throw new Error('Unsupported template: ' + t.name);
    value = value.slice(0, t.start) + replacement + value.slice(t.end);
  }
  return value.replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, '').replace(/<br\s*\/?\s*>/gi, '; ')
    .replace(/\[\[([^\]]+)\]\]/g, (_, body) => /^(file|image|category):/i.test(body) ? '' : body.split('|').at(-1))
    .replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, '$1').replace(/<[^>]*>/g, '').replace(/'{2,5}/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&(?:mdash|ndash);/g, '—').replace(/&quot;/g, '"')
    .replace(/&times;/g, '×').replace(/\s+/g, ' ').trim();
}
const optional = (raw, title) => { try { return cleanText(raw, title); } catch { return ''; } };
const preferences = (raw, title) => {
  const text = cleanText(raw, title);
  if (!text || /^(none|any|all|n\/a)$/i.test(text)) return [];
  return text.split(/\s*(?:;|,|\band\b|\bor\b)\s*/i).filter(Boolean);
};
function section(text, wanted) {
  const chunks = text.split(/^==\s*(.*?)\s*==\s*$/m);
  for (let i = 1; i < chunks.length; i += 2) if (wanted.test(optional(chunks[i]))) return chunks[i + 1] ?? '';
  return '';
}
function prose(text, title) {
  return text.replace(/\{\|[\s\S]*?\|\}/g, '').split(/\n\s*\n|\n(?=[*#])|^===.*?===\s*$/m)
    .map(part => optional(part.replace(/^[*#]+\s*/gm, ''), title)).filter(s => s && s.length <= 3000);
}
export function parsePage(kind, page, license) {
  const rev = page.revisions?.[0], text = rev?.slots?.main?.content;
  if (!Number.isInteger(page.pageid) || page.pageid <= 0 || !rev?.revid || !Number.isFinite(Date.parse(rev.timestamp)) || typeof text !== 'string' || /\{\{\s*(stub|delete|speedydelete|candidate for deletion)\b/i.test(text) || page.missing || /^#redirect/i.test(text)) return null;
  const title = page.title, all = templates(text), infobox = all.find(t => kind === 'fish' ? ['fish','fishinfobox'].includes(t.name) && Object.keys(t.args).length > 3 : ['fishing rod','rodinfobox'].includes(t.name));
  if (!infobox || !title || title.length > 200) return null;
  const a = infobox.args, value = key => cleanText(a[key], title);
  const secondary = { source: 'fandom', pageId: page.pageid, revision: rev.revid, revisionAt: rev.timestamp, license: license.text, licenseUrl: license.url };
  const common = { id: -page.pageid, page: title, name: title, url: 'https://fisch.fandom.com/wiki/' + encodeURIComponent(title.replace(/ /g, '_')), secondary };
  const removed = all.some(t => ['removed','unobtainable'].includes(t.name));
  try {
    if (kind === 'fish') {
      // A field explicitly set to None is valid. An absent field is incomplete.
      if (!['rarity','location','bait','time','weather','season'].every(k => Object.hasOwn(a, k))) return null;
      const rarity = value('rarity'), location = value('location');
      if (!rarity || !location || /^(unknown|tba|tbd|\?)$/i.test(rarity + location)) return null;
      return { ...common, name: optional(a.fish_name || a.name, title) || title, rarity, region: optional(a.bestiary, title), location,
        bait: preferences(a.bait, title), time: preferences(a.time, title), weather: preferences(a.weather, title), season: preferences(a.season, title),
        event: optional(a.event, title), methods: [], radar: [], locations: [], crabCages: [], adminEvents: [], removed, unobtainable: removed, nonfish: false };
    }
    if (!['lure_speed','luck','control','resilience','max_kg'].every(k => Object.hasOwn(a, k))) return null;
    const stat = key => { const text = value(key); if (!/^[+-]?[\d,.]+\s*%?$|^(?:inf(?:inite|inity)?|∞)$/i.test(text)) throw new Error('Unresolved stat'); return text; };
    const percent = key => { const text = stat(key); return /%|inf|∞/i.test(text) ? text : text + '%'; };
    const abilities = prose(section(text, /^(ability|abilities|passive|passives)$/i), title).map(text => ({ category: 'Passive effects', text, details: [], note: '' }));
    const recommendations = prose(section(text, /^enchanting$/i), title).map(text => ({ group: 'Miscellaneous', text, note: '', enchants: [] }));
    return { ...common, stage: 'Not listed', region: optional(a.location, title), source: '', quest: '', event: optional(a.event, title), price: optional(a.cost, title), level: optional(a.level, title),
      lure: percent('lure_speed'), luck: percent('luck'), control: stat('control'), resilience: percent('resilience'), maxWeight: stat('max_kg'),
      durability: '', disturbance: '', huntFocus: '', lineDistance: '', description: optional(a.quote, title), hint: '', unavailable: removed,
      recommendations, abilities, mastery: [], masteryLevel: '' };
  } catch { return null; }
}
