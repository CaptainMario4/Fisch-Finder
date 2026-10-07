export function splitWiki(value: string, delimiter = '|'): string[] {
  const parts: string[] = []; let start = 0, templates = 0, links = 0;
  for (let i = 0; i < value.length; i++) {
    const pair = value.slice(i, i + 2);
    if (pair === '{{') { templates++; i++; }
    else if (pair === '}}') { templates--; i++; }
    else if (pair === '[[') { links++; i++; }
    else if (pair === ']]') { links--; i++; }
    else if (!templates && !links && value.slice(i, i + delimiter.length) === delimiter) { parts.push(value.slice(start, i)); start = i + delimiter.length; i += delimiter.length - 1; }
  }
  parts.push(value.slice(start)); return parts;
}
export function wikiTemplates(value: string) {
  const entries: { start: number; end: number; name: string; args: Record<string,string>; positional: string[] }[] = [];
  let depth = 0, start = -1;
  for (let i = 0; i < value.length - 1; i++) {
    const pair = value.slice(i, i + 2);
    if (pair === '{{') { if (!depth) start = i; depth++; i++; }
    else if (pair === '}}' && depth) { depth--; i++; if (!depth) {
      const parts = splitWiki(value.slice(start + 2,i - 1)), name = parts.shift()?.trim().toLowerCase() ?? '';
      const args: Record<string,string> = {}, positional: string[] = [];
      for (const part of parts) { const match = part.match(/^\s*([\w.-]+)\s*=([\s\S]*)$/); if (match) args[match[1].toLowerCase()] = match[2].trim(); else positional.push(part.trim()); }
      entries.push({ start, end: i + 1, name, args, positional });
    }}
  }
  return entries;
}
export function questText(input: unknown): string {
  let value = String(input ?? '').replace(/<!--[\s\S]*?-->/g,'');
  // Preserve variable quest targets rather than dropping them as HTML tags.
  value = value.replace(/<(fish|location|mutation|currentfish|current fish|time|player|rod|rarity|weight|quantity|remaining time|given time|current skip item)>/gi, '[$1]');
  for (const t of wikiTemplates(value).reverse()) {
    const first = t.positional[0] ?? t.args['1'] ?? '', names = ['fish','rod','bait','item','mutation','rarity','weather','boat','harpoon','playertitle'];
    let text = '';
    if (t.name === 'coordinates') text = t.positional.slice(0,3).map(questText).join(', ');
    else if (t.name === 'c$' || t.name === 's$' || t.name === 'e$') text = `${t.name.toUpperCase()} ${questText(first)}`;
    else if (names.includes(t.name)) { const quantity = /^\d+(?:,\d{3})*(?:\.\d+)?$/.test(t.positional[1] ?? '') ? t.positional[1] + ' × ' : ''; const attrs = t.args.attrs ? questText(t.args.attrs).replace(/\s*,\s*/g, ' + ') + ' ' : ''; text = quantity + attrs + questText(t.args.text ?? first); if (t.name === 'mutation') { const parts=text.split(/\s*,\s*/);text=t.args.sep==='or'?parts.join(' or '):t.args.ls==='or'&&parts.length>1?parts.slice(0,-1).join(', ')+' or '+parts.at(-1):parts.join(' + '); } }
    else if (t.name === 'column') text = questText(t.positional.slice(1).join('|'));
    else if (t.name === 'ref') text = first ? ` (Note: ${questText(first)}) ` : '';
    else if (!t.name.startsWith('#') && !['stub','removed','unobtainable','background','main','distinguish','npcinfobox','change history','npc navbox','quest','dialogue start','dialogue end','reflist','clr'].includes(t.name)) text = questText(t.args.content ?? t.args.text ?? first);
    value = value.slice(0,t.start) + text + value.slice(t.end);
  }
  return value.replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi,'').replace(/<ref\b[^>]*\/>/gi,'')
    .replace(/\[\[([^\]]+)\]\]/g,(_,body:string)=> { const parts=body.split('|'); return /^(File|Image|Category):/i.test(parts[0]) ? '' : parts.at(-1)??''; })
    .replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g,'$1').replace(/<br\s*\/?\s*>/gi,'; ').replace(/<[^>]*>/g,'')
    .replace(/'{2,5}/g,'').replace(/&(?:nbsp|thinsp);/g,' ').replace(/&(?:ndash|mdash);/g,'—').replace(/&times;/g,'×').replace(/&amp;/g,'&').replace(/&quot;/g,'"')
    .replace(/&#(\d+);/g,(_,n:string)=>String.fromCodePoint(Math.min(Number(n),0x10ffff)))
    .replace(/^[*#:;]+\s*/gm,'').replace(/[{}]/g,'').replace(/\s+/g,' ').trim();
}
export function wikiSection(value:string, heading:string) {
  const match=new RegExp(`^==\\s*${heading}\\s*==\\s*$`,'im').exec(value); if (!match) return '';
  const rest=value.slice(match.index+match[0].length), end=rest.search(/^(?:==[^=].*?==\s*$|=+\s*(?:Dialogue|Change History|Navigation|Gallery|Trivia)\s*=+\s*$)/m); return end<0?rest:rest.slice(0,end);
}
export function stableKey(value:string) { let hash=2166136261; for (const char of value) { hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619); } return (hash>>>0).toString(36); }
export type QuestRef = { page:string; name:string; quantity:string; attributes:string };
export function questReferences(value:string, kind:'fish'|'rod') : QuestRef[] {
  const refs:QuestRef[]=[];
  for (const t of wikiTemplates(value)) {
    if (t.name===kind && t.positional[0]) refs.push({page:questText(t.positional[0]), name:questText(t.args.text??t.positional[0]),quantity:/^\d+(?:,\d{3})*(?:\.\d+)?$/.test(t.positional[1]??'')?t.positional[1]:'',attributes:questText(t.args.attrs)});
    // Wrappers may contain links; named presentation arguments need not be scanned twice.
    else refs.push(...questReferences([...t.positional,...Object.values(t.args)].join('\n'),kind));
  }
  return refs.filter((r,i)=>refs.findIndex(other=>other.page===r.page&&other.attributes===r.attributes&&other.quantity===r.quantity)===i);
}
export type QuestTable = { caption:string; headers:string[]; rows:string[][] };
export function questTables(value:string):QuestTable[] {
  const tables:QuestTable[]=[];
  for (const match of value.matchAll(/\{\|[\s\S]*?\|\}/g)) {
    const text=match[0],caption=questText(text.match(/^\|\+\s*(.+)$/m)?.[1]), headers=splitWiki(text.split('\n').filter(line=>/^!/.test(line)).map(line=>line.replace(/^!\s*/,'')).join('!!'),'!!').map(questText).filter(Boolean);
    const rows:string[][]=[], spans=new Map<number,{text:string;remaining:number}>();
    for (const raw of text.split(/^\|-.*$/m).slice(1)) {
      const cells:string[]=[]; let current='';
      for (const line of raw.split('\n')) {
        if (/^\|[+}]/.test(line)||/^!/.test(line)) continue;
        if (/^\|/.test(line)) { if(current.trim()) cells.push(current);const split=splitWiki(line.slice(1),'||');cells.push(...split.slice(0,-1));current=split.at(-1)??''; }
        else current+='\n'+line;
      }
      if(current.trim())cells.push(current); if(!cells.length)continue;
      const row:string[]=[];let column=0;
      const fillSpans=()=> { while(spans.has(column)) {const span=spans.get(column)!;row[column++]=span.text;if(--span.remaining<=0)spans.delete(column-1);} };
      for (const cell of cells) { fillSpans();const pipe=splitWiki(cell);const decorated=pipe.length>1&&/^\s*(?:rowspan|colspan|style|class|align|width)\s*=/.test(pipe[0]);const content=questText(decorated?pipe.slice(1).join('|'):cell);const rowspan=decorated?Number(pipe[0].match(/rowspan\s*=\s*["']?(\d+)/)?.[1]??1):1;row[column]=content;if(rowspan>1)spans.set(column,{text:content,remaining:rowspan-1});column++; }
      fillSpans();if(row.some(Boolean))rows.push(row);
    }
    const width=Math.max(headers.length,...rows.map(r=>r.length),1);tables.push({caption,headers:Array.from({length:width},(_,i)=>headers[i]||`Detail ${i+1}`),rows:rows.map(r=>Array.from({length:width},(_,i)=>r[i]??''))});
  }
  return tables;
}
