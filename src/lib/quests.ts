import snapshot from '../data/quests-snapshot.json';
import { questText, wikiTemplates, wikiSection, questReferences, questTables, stableKey } from './quest-wiki';
import type { QuestRef, QuestTable } from './quest-wiki';
export type QuestTask = { id:string; text:string; fish:QuestRef[]; rods:QuestRef[]; mutations:string[] };
export type QuestStep = { id:string; title:string; tasks:QuestTask[] };
export type QuestStage = { id:string; name:string; steps:QuestStep[]; archived:boolean };
export type QuestBlock = { heading:string; paragraphs:string[]; tables:QuestTable[] };
export type QuestDetails = { description:string; gps:string; stages:QuestStage[]; notes:QuestBlock[]; rewards:string[]; incomplete:boolean };
export type Quest = QuestDetails & { id:number; page:string; name:string; npc:string; locations:string[]; events:string[]; status:'available'|'unavailable'|'unknown'; type:string; url:string };
export type QuestFish = { page:string; name:string; location:string; bait:string[]; weather:string[]; time:string[]; season:string[]; methods:string[]; maximumWeight:number|null; unavailable:boolean };
export type QuestRod = { page:string; name:string; stage:string; maximumWeight:number|null; weightLabel:string; level:string; unavailable:boolean };
export type QuestMutation = { page:string; name:string; notes:string[]; rods:QuestRef[]; url:string };
export type QuestDataset = { quests:Quest[]; fish:QuestFish[]; rods:QuestRod[]; mutations:QuestMutation[]; fetchedAt:string; mode:'api'|'snapshot'; notice:string };
export type RawNpc = Record<string,unknown>;
type Source = { revision:number; details:QuestDetails };
type MutationSource = { revision:number; details:QuestMutation };
const flag=(v:unknown)=>v===true||v===''||v===1||v==='1'||v==='true';
const list=(v:unknown)=>(Array.isArray(v)?v:v==null?[]:String(v).split(';')).map(questText).filter(Boolean);
export const wikiUrl=(page:string)=>'https://fischipedia.org/wiki/'+encodeURIComponent(page.replace(/ /g,'_'));
function mutationNames(value:string) {
  const names:string[]=[];
  for(const t of wikiTemplates(value)) { if(t.name==='mutation') names.push(...(t.positional[0]??'').split(',').map(questText));if(t.args.attrs)names.push(...t.args.attrs.split(',').map(questText));names.push(...mutationNames([...t.positional,...Object.values(t.args)].join('\n'))); }
  return [...new Set(names.filter(Boolean))];
}
function prose(value:string) { return value.split(/\n\s*\n|\n(?=\s*\*[^*])/).map(questText).filter(Boolean); }
export function extractQuestDetails(input:string):QuestDetails {
  const text=input.replace(/<!--[\s\S]*?-->/g,''), infobox=wikiTemplates(text).find(t=>t.name==='npcinfobox');
  const intro=text.split(/^==/m)[0], description=questText(intro.replace(/\{\{(?:Stub|Main|Background|Distinguish)\b[\s\S]*?\}\}/gi,''));
  const body=wikiSection(text,'Quests?'), dialogue=wikiSection(text,'Dialogue'), templates=wikiTemplates(body).filter(t=>t.name==='quest');
  const stages:QuestStage[]=templates.map((t,index)=> {
    const name=questText(t.args.name)||`Quest ${index+1}`, id=stableKey(`${name}:${templates.slice(0,index).filter(x=>questText(x.args.name)===name).length}`), steps:QuestStep[]=[];
    const heading=[...body.slice(0,t.start).matchAll(/^===+\s*(.*?)\s*===+\s*$/gm)].at(-1)?.[1]??'';
    const relatedDialogue=heading?dialogue.split(new RegExp(`^====?\\s*${heading.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s*====?\\s*$`,'m'))[1]?.split(/^====?/m)[0]??'':'';
    const archived=/\{\{(?:Removed|Unobtainable)\b/i.test(relatedDialogue)||/\{\{(?:Removed|Unobtainable)\b/i.test(body.slice(Math.max(0,t.start-160),t.start));
    for(let i=1;i<=30;i++) {
      const title=questText(t.args[`step${i}`]), raw=t.args[`tasks${i}`]??'';
      if(!title&&!raw.trim())continue;
      const tasks=raw.split(/\n+/).map(line=>line.trim()).filter(Boolean).map((line,taskIndex)=>({id:stableKey(`${id}:${i}:${taskIndex}:${line}`),text:questText(line),fish:questReferences(line,'fish'),rods:questReferences(line,'rod'),mutations:mutationNames(line)})).filter(task=>task.text);
      // Some objectives exist entirely in a step label rather than a task list.
      if(!tasks.length&&title)tasks.push({id:stableKey(`${id}:${i}:${t.args[`step${i}`]}`),text:title,fish:questReferences(t.args[`step${i}`],'fish'),rods:questReferences(t.args[`step${i}`],'rod'),mutations:mutationNames(t.args[`step${i}`])});
      steps.push({id:stableKey(`${id}:${i}`),title:title||`Objectives ${i}`,tasks});
    }
    return {id,name,steps,archived};
  });
  let notesBody=body;for(const t of templates.slice().reverse())notesBody=notesBody.slice(0,t.start)+'\n'+notesBody.slice(t.end);
  const notes:QuestBlock[]=[];
  for(const chunk of notesBody.split(/(?=^===+[^\n]+===+\s*$)/m)) {
    const heading=chunk.match(/^===+\s*(.*?)\s*===+\s*$/m)?.[1]??'Requirements & guide notes';
    const paragraphs=prose(chunk.replace(/^===+.*?===+\s*$/gm,'').replace(/\{\|[\s\S]*?\|\}/g,''));const tables=questTables(chunk);
    if(paragraphs.length||tables.length)notes.push({heading:questText(heading),paragraphs,tables});
  }
  const gameplay=prose(wikiSection(text,'Gameplay Notes'));if(gameplay.length)notes.push({heading:'Gameplay notes',paragraphs:gameplay,tables:[]});
  // Reward markers are deliberately kept separate from catch requirements.
  const rewards=[...new Set([...dialogue.matchAll(/^.*?(?:\(Rewards?\s+|;Rewards?\s+)(.*)$/gim)].map(m=>questText(m[1]).replace(/\)\s*$/,'')).filter(Boolean))];
  for(const block of notes)for(const p of block.paragraphs)if(/\breward(?:s|ed)?\b|\bobtain\b.*\bafter completing\b/i.test(p)&&!rewards.includes(p))rewards.push(p);
  return {description,gps:questText(infobox?.args.gps),stages,notes,rewards,incomplete:/\{\{Stub\b/i.test(text)||!stages.length||stages.some(s=>!s.steps.length)||/<(?:fish|CurrentFish|Mutation|location)>/i.test(body)};
}
export function normalizeQuests(raw:RawNpc[],sources:Record<string,Source>):Quest[] {
  const groups=new Map<number,RawNpc[]>();for(const row of raw){const id=Number(row.page_id);if(!groups.has(id))groups.set(id,[]);groups.get(id)!.push(row);}
  return [...groups].map(([id,rows])=>{
    const row=rows.find(r=>!flag(r.is_removed))??rows[0], details=sources[String(id)]?.details??{description:'',gps:'',stages:[],notes:[],rewards:[],incomplete:true};
    const npc=questText(row.name??row.page_name),locations=[...new Set(rows.filter(r=>flag(r.is_removed)===flag(row.is_removed)).flatMap(r=>list(r.location)))],events=[...new Set(rows.flatMap(r=>list(r.event)))];
    const available=rows.some(r=>r.is_removed===false),removed=rows.every(r=>flag(r.is_removed));
    const name=details.stages.length===1?details.stages[0].name:`${npc} — quests`;
    const repeated=/repeatable|many times|automatically refreshes|without any cooldown/i.test(details.notes.flatMap(b=>b.paragraphs).join(' '))||/challenger|angler|bounty tracker/i.test(npc);
    return {...details,id,page:String(row.page_name),npc,name,locations,events,status:available?'available' as const:removed?'unavailable' as const:'unknown' as const,type:repeated?'Repeatable':details.stages.length>1?'Quest collection':events.length?'Event quest':'Quest',url:wikiUrl(String(row.page_name))};
  }).sort((a,b)=>a.name.localeCompare(b.name));
}
export function normalizeQuestFish(raw:Record<string,unknown>[]):QuestFish[]{return raw.map(r=>({page:String(r.page_name),name:questText(r.name??r.page_name),location:list(r.location).join('; ')||questText(r.bestiary),bait:list(r.bait),weather:list(r.weather),time:list(r.time),season:list(r.season),methods:list(r.source),maximumWeight:Number.isFinite(Number(r.base_weight))&&r.base_weight!=null?Number(r.base_weight):null,unavailable:flag(r.is_removed)||flag(r.is_unob)}));}
export function normalizeQuestRods(raw:Record<string,unknown>[]):QuestRod[]{return raw.map(r=>{const label=questText(r.max_weight),n=Number(label.replace(/,/g,'').replace(/\s*kg\s*/gi,''));return {page:String(r.page_name),name:questText(r.journal??r.page_name),stage:questText(r.stage),maximumWeight:/inf|∞/i.test(label)?1e99:label&&Number.isFinite(n)?n:null,weightLabel:label,level:questText(r.level),unavailable:flag(r.is_removed)||flag(r.is_unob)};});}
export function extractQuestMutation(page:string,text:string):QuestMutation {const body=wikiSection(text,'Obtainment'),infobox=wikiTemplates(text).find(t=>t.name==='mutationinfobox');return {page,name:questText(infobox?.args.name)||page,notes:prose(body),rods:questReferences(body,'rod'),url:wikiUrl(page)};}
export const questFallback=snapshot.data as unknown as QuestDataset;
const API='https://fischipedia.org/w/api.php';
const NPC_QUERY="mw.bucket('npcs').select('page_id','page_name','name','location','event','is_quest','is_event','is_removed').limit(5000):run()";
const FISH_QUERY="mw.bucket('fish').select('page_name','name','location','bestiary','bait','weather','time','season','source','base_weight','is_unob','is_removed').limit(5000):run()";
const ROD_QUERY="mw.bucket('rods').select('page_name','journal','stage','max_weight','level','is_unob','is_removed').limit(5000):run()";
let sources=Object.fromEntries(Object.entries(snapshot.revisions).map(([id,revision])=>[id,{revision,details:questFallback.quests.find(q=>q.id===Number(id))!}])) as Record<string,Source>;
let mutationSources=Object.fromEntries(Object.entries(snapshot.mutationRevisions).map(([id,source])=>[id,{revision:source.revision,details:questFallback.mutations.find(m=>m.page===source.page)!}])) as Record<string,MutationSource>;
let cache:QuestDataset|undefined,expires=0,lastAttempt=0,pending:Promise<QuestDataset>|undefined;
async function request(params:Record<string,string>){const u=new URL(API);u.search=new URLSearchParams({...params,format:'json',formatversion:'2'}).toString();const response=await fetch(u,{cache:'no-store',signal:AbortSignal.timeout(18000),headers:{'User-Agent':'FischFinder/1.0 (read-only quest guide)'}});if(!response.ok)throw new Error('Wiki HTTP '+response.status);const payload=await response.json();if(payload.error)throw new Error('Wiki API error');return payload;}
async function pages(ids:number[],content:boolean){const batches:number[][]=[];for(let i=0;i<ids.length;i+=50)batches.push(ids.slice(i,i+50));const out:any[]=[];for(let i=0;i<batches.length;i+=2){const replies=await Promise.all(batches.slice(i,i+2).map(batch=>request({action:'query',pageids:batch.join('|'),prop:'revisions',rvprop:content?'ids|content':'ids',...(content?{rvslots:'main'}:{})})));for(const reply of replies){if(!Array.isArray(reply.query?.pages))throw new Error('Missing pages');out.push(...reply.query.pages);}}if(out.length!==ids.length||new Set(out.map(p=>p.pageid)).size!==ids.length||out.some(p=>!ids.includes(p.pageid)||!p.revisions?.[0]?.revid))throw new Error('Incomplete quest pages');return out;}
export async function getQuestDataset({forceRefresh=false}:{forceRefresh?:boolean}={}):Promise<QuestDataset>{
 if(pending)return pending;if(cache&&(Date.now()<lastAttempt+60000||!forceRefresh&&Date.now()<expires))return cache;lastAttempt=Date.now();
 pending=(async()=>{try{
  const [npcPayload,categoryPayload]=await Promise.all([request({action:'bucket',query:NPC_QUERY}),request({action:'query',list:'categorymembers',cmtitle:'Category:Quest NPCs',cmlimit:'500',cmnamespace:'0'})]);
  const all:RawNpc[]=npcPayload.bucket,category=categoryPayload.query?.categorymembers;
  if(!Array.isArray(all)||!all.length||all.length>=5000||!Array.isArray(category)||categoryPayload.continue)throw new Error('Incomplete quest catalog');
  const categoryIds=new Set(category.map((p:any)=>p.pageid));const raw=all.filter(r=>flag(r.is_quest)||categoryIds.has(Number(r.page_id)));
  for(const item of category)if(!raw.some(r=>Number(r.page_id)===item.pageid))raw.push({page_id:item.pageid,page_name:item.title,name:item.title});
  const ids=[...new Set(raw.map(r=>Number(r.page_id)))];if(ids.some(id=>!Number.isInteger(id)||id<=0)||ids.length<questFallback.quests.length*.7)throw new Error('Incomplete NPC catalog');
  const revisions=await pages(ids,false),changed=revisions.filter(p=>sources[String(p.pageid)]?.revision!==p.revisions[0].revid),updated={...sources};
  if(changed.length)for(const p of await pages(changed.map(p=>p.pageid),true)){const rev=p.revisions[0],body=rev.slots?.main?.content;if(typeof body!=='string'||!/\{\{NPCInfobox\b/i.test(body))throw new Error('Missing quest source');updated[String(p.pageid)]={revision:rev.revid,details:extractQuestDetails(body)};}
  const quests=normalizeQuests(raw,updated),needed=new Set(quests.flatMap(q=>q.stages.flatMap(s=>s.steps.flatMap(step=>step.tasks.flatMap(t=>t.mutations)))));
  const [fishPayload,rodPayload,mutationPayload]=await Promise.all([request({action:'bucket',query:FISH_QUERY}),request({action:'bucket',query:ROD_QUERY}),request({action:'bucket',query:"mw.bucket('mutations').select('page_id','page_name','name').limit(5000):run()"})]);
  if(!Array.isArray(fishPayload.bucket)||fishPayload.bucket.length<questFallback.fish.length*.7||!Array.isArray(rodPayload.bucket)||rodPayload.bucket.length<questFallback.rods.length*.7||!Array.isArray(mutationPayload.bucket)||!mutationPayload.bucket.length)throw new Error('Incomplete catch data');
  const mutationRows=mutationPayload.bucket.filter((r:any)=>needed.has(questText(r.name??r.page_name))||needed.has(String(r.page_name))),mIds=[...new Set<number>(mutationRows.map((r:any)=>Number(r.page_id)))],mutationUpdated={...mutationSources};
  if(mIds.length){const revs=await pages(mIds,false),different=revs.filter(p=>mutationSources[String(p.pageid)]?.revision!==p.revisions[0].revid);if(different.length)for(const p of await pages(different.map(p=>p.pageid),true)){const rev=p.revisions[0];if(typeof rev.slots?.main?.content!=='string')throw new Error('Missing mutation source');mutationUpdated[String(p.pageid)]={revision:rev.revid,details:extractQuestMutation(p.title,rev.slots.main.content)};}}
  const mutations=mutationRows.map((r:any)=>mutationUpdated[String(r.page_id)]?.details).filter(Boolean);sources=updated;mutationSources=mutationUpdated;
  cache={quests,fish:normalizeQuestFish(fishPayload.bucket),rods:normalizeQuestRods(rodPayload.bucket),mutations,fetchedAt:new Date().toISOString(),mode:'api',notice:''};expires=Date.now()+30*60*1000;return cache;
 }catch{cache={...(cache??questFallback),mode:'snapshot',notice:'Wiki refresh unavailable. Keeping the last successful quest guides, catch data, and source timestamp.'};expires=Date.now()+60000;return cache;}finally{pending=undefined;}})();return pending;
}
