import { questText, questTables, splitWiki, wikiSection, wikiTemplates } from './quest-wiki';
import type { Rod } from './rods';

export type ObtainRef = { kind:'rod'|'fish'|'item'|'quest'|'wiki'; page:string; name:string; quantity:string; attributes:string };
export type ObtainStep = { text:string; references:ObtainRef[] };
export type ObtainSection = { heading:string; steps:ObtainStep[] };
export type RodObtainment = { version:2; sections:ObtainSection[]; references:ObtainRef[]; level?:string; price?:string };
const fold=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]/g,'');
const clean=(value:string)=>value.replace(/<!--[\s\S]*?-->/g,'').replace(/<span\b[^>]*style\s*=\s*["'][^"']*display\s*:\s*none[^"']*["'][^>]*>[\s\S]*?<\/span>/gi,'').replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi,'').replace(/<ref\b[^>]*\/>/gi,'');
const safePage=(value:string)=>!!value&&!/^(?:File|Image|Category|Template|Special|https?|javascript|data):/i.test(value)&&!/[<>{}\n]/.test(value);
// Fischipedia's Recipe template lists ingredient names in "sort" and stores
// count/note in parameters named after each ingredient (including spaces).
function recipeData(value:string,start:number,end:number){
 const args:Record<string,string>={};
 for(const part of splitWiki(value.slice(start+2,end-2)).slice(1)){
  const at=part.indexOf('=');if(at>0)args[part.slice(0,at).trim()]=part.slice(at+1).trim();
 }
 const refs:ObtainRef[]=[];
 for(const ingredient of (args.sort??'').split(';').map(x=>x.trim()).filter(Boolean)){
  const page=questText(ingredient);if(!safePage(page))continue;
  const countNote=args[ingredient]??args[page]??'',slash=countNote.indexOf('/');
  const count=questText(slash<0?countNote:countNote.slice(0,slash)),note=questText(slash<0?'':countNote.slice(slash+1));
  refs.push({kind:'item',page,name:page,quantity:/^\d+(?:,\d{3})*(?:\.\d+)?$/.test(count)?count:'',attributes:note});
 }
 const level=questText(args.level),rawPrice=questText(args.price),currency=questText(args.currency)||'C$';
 const price=rawPrice?/^\d+(?:,\d{3})*(?:\.\d+)?$/.test(rawPrice)?currency+' '+rawPrice:rawPrice:'';
 return {refs,level,price};
}
export function obtainmentReferences(raw:string,defaultKind:ObtainRef['kind']='wiki'):ObtainRef[] {
 const value=clean(raw),refs:ObtainRef[]=[];
 const scan=(text:string)=>{
  // Recognized templates are semantic references; do not re-read their display
  // arguments as extra materials. Unknown wrappers are scanned recursively.
  let remaining=text;
  for(const t of wikiTemplates(text).reverse()){
   if(t.name==='recipe'){refs.push(...recipeData(text,t.start,t.end).refs);remaining=remaining.slice(0,t.start)+remaining.slice(t.end);continue;}
   const kind=t.name==='rod'?'rod':t.name==='fish'?'fish':['item','bait'].includes(t.name)?'item':['quest','npc'].includes(t.name)?'quest':undefined;
   const page=questText(t.positional[0]??t.args['1']);
   if(kind&&safePage(page)){
    const quantity=questText(t.args.x??t.args.quantity??t.positional[1]??'');
    refs.push({kind,page,name:questText(t.args.text??t.positional[0]??t.args['1']),quantity:/^\d+(?:,\d{3})*(?:\.\d+)?$/.test(quantity)?quantity:'',attributes:questText(t.args.attrs)});
   }else if(!/^(?:main|see also|reflist|ref|.*navbox|rodinfobox)$/i.test(t.name))scan([...t.positional,...Object.values(t.args)].join('\n'));
   remaining=remaining.slice(0,t.start)+remaining.slice(t.end);
  }
  for(const m of remaining.matchAll(/\[\[([^\]]+)\]\]/g)){
   const parts=m[1].split('|'),page=parts[0].trim();
   if(safePage(page))refs.push({kind:defaultKind,page,name:questText(parts.at(-1)),quantity:'',attributes:''});
  }
 };
 scan(value);
 return refs.filter((ref,i)=>refs.findIndex(other=>fold(other.page)===fold(ref.page)&&other.kind===ref.kind&&other.quantity===ref.quantity&&other.attributes===ref.attributes)===i);
}
export function rodQuestReferences(raw:unknown):ObtainRef[] {
 const value=clean(String(raw??'')),refs=obtainmentReferences(value,'quest');
 if(refs.length)return refs.map(ref=>({...ref,kind:'quest'}));
 const text=questText(value);return text&&safePage(text)?[{kind:'quest',page:text,name:text,quantity:'',attributes:''}]:[];
}
function stepText(raw:string){
 let value=raw;
 for(const t of wikiTemplates(raw).reverse()){
  if(t.name==='recipe'){
   const recipe=recipeData(raw,t.start,t.end);
   const label=[recipe.level?'Required level: '+recipe.level:'',...recipe.refs.map(ref=>ref.name+(ref.quantity?' ×'+ref.quantity:'')+(ref.attributes?' ('+ref.attributes+')':'')),recipe.price?'Price: '+recipe.price:''].filter(Boolean).join(' · ');
   value=value.slice(0,t.start)+label+value.slice(t.end);
  }else if(['rod','fish','item','bait'].includes(t.name)){
   const quantity=questText(t.args.x??t.args.quantity??t.positional[1]??'');
   const label=[/^\d+(?:,\d{3})*(?:\.\d+)?$/.test(quantity)?quantity+' ×':'',questText(t.args.attrs),questText(t.args.text??t.positional[0]??t.args['1'])].filter(Boolean).join(' ');
   value=value.slice(0,t.start)+label+value.slice(t.end);
  }
 }
 return questText(value);
}
export function extractRodObtainment(wikitext:string):RodObtainment {
 const section=wikiSection(clean(wikitext),'(?:Obtainment|Obtaining|Acquisition)');
 const sections:ObtainSection[]=[];let current:ObtainSection={heading:'Obtainment',steps:[]};
 const add=(raw:string)=>{
  const text=stepText(raw);if(!text)return;
  if(current.steps.at(-1)?.text!==text)current.steps.push({text,references:obtainmentReferences(raw)});
 };
 // Tables are preserved as source rows rather than guessed crafting recipes.
 const tables:string[][]=[];
 const flattened=section.replace(/\{\|[\s\S]*?\|\}/g,raw=>{
  const rows:string[]=[];
  for(const table of questTables(raw,stepText)){
   if(table.caption)rows.push(table.caption);
   for(const row of table.rows)rows.push(row.map((cell,i)=>cell?table.headers[i]+': '+cell:'').filter(Boolean).join(' · '));
  }
  tables.push(rows);return '\nOBTAINMENT_TABLE_'+(tables.length-1)+'\n';
 });
 let paragraph='';
 const flush=()=>{if(paragraph.trim())add(paragraph);paragraph='';};
 for(const line of flattened.split('\n')){
  const heading=line.match(/^={3,6}\s*(.*?)\s*={3,6}\s*$/);
  const table=line.match(/^OBTAINMENT_TABLE_(\d+)$/);
  if(table){flush();for(const row of tables[Number(table[1])])add(row);}
  else if(heading){flush();if(current.steps.length)sections.push(current);current={heading:questText(heading[1]),steps:[]};}
  else if(!line.trim()){flush();}
  else if(/^\s*[*#;:]/.test(line)){flush();add(line);}
  else paragraph+=(paragraph?'\n':'')+line;
 }
 flush();if(current.steps.length)sections.push(current);
 const recipes=wikiTemplates(section).filter(t=>t.name==='recipe').map(t=>recipeData(section,t.start,t.end));
 const levels=[...new Set(recipes.map(r=>r.level).filter(Boolean))],prices=[...new Set(recipes.map(r=>r.price).filter(Boolean))];
 const references=obtainmentReferences(section).map(ref=>{
  if(ref.quantity)return ref;
  const quantities=questTables(section,stepText).flatMap(table=>{
   const column=table.headers.findIndex(h=>/^(?:quantity|amount|count)$/i.test(h));
   if(column<0)return [];
   return table.rows.flatMap(row=>row.some(cell=>fold(cell)===fold(ref.name))&&/^\d+(?:,\d{3})*$/.test(row[column])?[row[column]]:[]);
  });
  return new Set(quantities).size===1?{...ref,quantity:quantities[0]}:ref;
 });
 return {version:2,sections,references,level:levels.length===1?levels[0]:undefined,price:prices.length===1?prices[0]:undefined};
}
export type ObtainNode = { id:string; kind:'level'|'quest'|'event'|'price'|'rod'|'fish'|'item'|'wiki'; title:string; detail:string; reference?:ObtainRef };
export function rodObtainmentNodes(rod:Rod,rods:Rod[]):ObtainNode[] {
 const nodes:ObtainNode[]=[];
 if(rod.level||rod.obtainment?.level)nodes.push({id:'level',kind:'level',title:'Required level',detail:rod.level||rod.obtainment!.level!});
 for(const ref of rod.questReferences??[])nodes.push({id:'quest:'+ref.page,kind:'quest',title:ref.name,detail:'Quest prerequisite',reference:ref});
 // Older cached/secondary entries can still display their known metadata.
 if(!(rod.questReferences?.length)&&rod.quest)nodes.push({id:'quest',kind:'quest',title:rod.quest.replace(/Quest$/,'').trim(),detail:'Quest listed by the source',reference:{kind:'quest',page:rod.quest.replace(/Quest$/,'').trim(),name:rod.quest.replace(/Quest$/,'').trim(),quantity:'',attributes:''}});
 if(rod.event)nodes.push({id:'event',kind:'event',title:'Event requirement',detail:rod.event});
 if(rod.price||rod.obtainment?.price)nodes.push({id:'price',kind:'price',title:'Listed cost',detail:rod.price||rod.obtainment!.price!});
 for(const ref of rod.obtainment?.references??[]){
  if(fold(ref.page)===fold(rod.page)||nodes.some(n=>n.reference&&fold(n.reference.page)===fold(ref.page)&&n.reference.attributes===ref.attributes&&n.reference.quantity===ref.quantity))continue;
  const matchingRod=rods.find(r=>fold(r.page)===fold(ref.page)||fold(r.name)===fold(ref.name));
  if(matchingRod&&fold(matchingRod.page)===fold(rod.page))continue;
  const kind=matchingRod?'rod':ref.kind;
  nodes.push({id:[kind,ref.page,ref.quantity,ref.attributes].join(':'),kind,title:ref.name,detail:[ref.quantity?'×'+ref.quantity:'',ref.attributes,kind==='rod'?'Referenced rod':kind==='fish'||kind==='item'?'Referenced fish / item':'Referenced unlock or location'].filter(Boolean).join(' · '),reference:matchingRod?{...ref,page:matchingRod.page,kind:'rod'}:ref});
 }
 return nodes;
}
export const obtainWikiUrl=(ref:ObtainRef)=>'https://fischipedia.org/wiki/'+encodeURIComponent(ref.page.replace(/ /g,'_'));
export const obtainQuestUrl=(ref:ObtainRef)=>'/quests?'+new URLSearchParams({quest:ref.page,q:ref.name,status:'all'}).toString();
