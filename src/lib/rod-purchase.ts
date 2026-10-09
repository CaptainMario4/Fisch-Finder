import type { Rod } from './rods';
import { obtainmentReferences } from './rod-obtainment';
import type { ObtainRef, ObtainStep } from './rod-obtainment';
import { questText, wikiTemplates } from './quest-wiki';

export type AreaAccessGuide = { region:string; page:string; revision:number; fetchedAt:string; steps:ObtainStep[]; equipment:string[] };
export type PurchaseAccess = { area?:AreaAccessGuide; equipment:AreaAccessGuide[] };
export type AccessGuides = Record<string,AreaAccessGuide>;
export const accessKey=(value:string)=>value.replace(/_/g,' ').split('#')[0].trim().toLowerCase();
export const safeAccessPage=(value:string)=>!!value&&value.length<160&&!/[:<>{}\n]/.test(value)&&!['limited','regionless','not listed'].includes(accessKey(value));
const purchaseWord=/\b(?:purchas(?:e[ds]?|ing|able)|buy|bought|sold|shop|merchant)\b/i;
export function purchasePath(rod:Rod){
 const sections=rod.obtainment?.sections??[];
 const purchaseSections=sections.filter(section=>purchaseWord.test(section.heading));
 const direct=purchaseWord.test(rod.source)||purchaseWord.test(rod.hint);
 const steps=(purchaseSections.length?purchaseSections.flatMap(section=>section.steps):sections.flatMap(section=>section.steps).filter(step=>purchaseWord.test(step.text)))
  .filter(step=>!/Location Context .*\.png|^.*\.(?:png|jpg)\|/i.test(step.text));
 if(!direct&&!steps.length)return;
 return {location:rod.region,price:rod.price||rod.obtainment?.price||'',steps, hint:!steps.length?rod.hint:'',alternative:!direct};
}
export function attachPurchaseAccess(rod:Rod,guides:AccessGuides):Rod{
 if(rod.secondary||!purchasePath(rod))return rod;
 const area=guides[accessKey(rod.region)];
 return area?{...rod,purchaseAccess:{area,equipment:area.equipment.flatMap(page=>guides[accessKey(page)]?[guides[accessKey(page)]]:[])}}:rod;
}

// Read only the requested location's prose and named access sections. A location
// page often also describes fishing, hunts, rewards and several adjacent areas.
// Those must not be promoted to entrance requirements or inherited by siblings.
export function extractAreaAccess(region:string,page:string,revision:number,text:string,fetchedAt:string):AreaAccessGuide{
 const clean=text.replace(/<!--[\s\S]*?-->/g,'').replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi,'').replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi,(_,level,title)=>'\n'+ '='.repeat(Number(level))+' '+questText(title)+' '+ '='.repeat(Number(level))+'\n');
 const headings=[...clean.matchAll(/^(={1,6})\s*(.*?)\s*\1\s*$/gm)];
 const named=accessKey(region)!==accessKey(page)?headings.find(h=>accessKey(questText(h[2]))===accessKey(region)):undefined;
 let body=clean;
 if(named){const start=named.index!+named[0].length;const end=headings.find(h=>h.index!>named.index!&&h[1].length<=named[1].length)?.index;body=clean.slice(start,end);}
 else if(accessKey(region)!==accessKey(page))return {region,page,revision,fetchedAt,steps:[],equipment:[]};
 const chunks=body.split(/^(={1,6})\s*(.*?)\s*\1\s*$/gm);
 const portions=[chunks[0]];
 for(let i=1;i<chunks.length;i+=3){
  const heading=questText(chunks[i+1]),intro=questText(chunks[i+2].split(/\n\s*\n/).slice(0,2).join('\n'));
  if(/^(?:access|accessing|entrance|entry|requirements?|getting (?:there|to)|how to (?:enter|reach|access)|obtainment|obtaining|usage|travel|navigation guide)$|^(?:Entering |Accessing |Entrance to )|(?: Entry Point| Portal)$/i.test(heading)||intro.toLowerCase().includes('entrance to the '+region.toLowerCase()))portions.push(chunks[i+2]);
 }
 const steps:ObtainStep[]=[],equipment:string[]=[];
 for(const [portionIndex,portion] of portions.entries()){
  const prose=portion.replace(/\{\|[\s\S]*?\|\}/g,'').replace(/<gallery\b[^>]*>[\s\S]*?<\/gallery>/gi,'').replace(/\[\[(?:File|Image):[^\]]*\]\]/gi,'').replace(/\{\{(?:LocationInfobox|AccessoryInfobox|NPCInfobox)[\s\S]*?\}\}/gi,'');
  let list:boolean=false;
  for(const paragraph of prose.split(/\n\s*\n|\n(?=\s*[*#])/)){
   const value=questText(paragraph);
   const bullet=/^\s*[*#]/.test(paragraph),followList:boolean=bullet&&list;
   if(!bullet)list=false;
   if(!value||/^(?:Fishing (?:in|at)|During |Multiple NPCs|Possible rewards|Touching |Flowers |Seeds )/i.test(value)||/consists of .*sub-locations/i.test(value))continue;
   if(!portionIndex&&!followList&&!/\b(?:access(?:ed|ible)?|enter(?:ed|ing)?|entrance|reach(?:ed)?|navigat(?:e|ing)|travel|requires?|required|must|unlock(?:ed)?|locked|equip(?:ped)?|purchas(?:able|ed)|obtained from completing)\b/i.test(value))continue;
   list=followList||value.endsWith(':');
   const references=obtainmentReferences(paragraph);
   for(const template of wikiTemplates(paragraph)){
    if(template.name==='boat'&&template.positional[0])references.push({kind:'item',page:questText(template.positional[0]),name:questText(template.positional[0]),quantity:'',attributes:''});
   }
   for(const ref of references){
    const needed=value.split(/(?<=[.!?])\s+/).some(sentence=>[ref.name,ref.page].some(name=>sentence.toLowerCase().includes(name.toLowerCase()))&&/\b(?:required|requires?|must|equip(?:ped)?)\b/i.test(sentence)&&!/\bnot required\b/i.test(sentence));
    if(needed&&ref.kind==='item'&&safeAccessPage(ref.page)&&!equipment.includes(ref.page))equipment.push(ref.page);
   }
   if(!steps.some(step=>step.text===value))steps.push({text:value,references});
  }
 }
 return {region,page,revision,fetchedAt,steps,equipment};
}
