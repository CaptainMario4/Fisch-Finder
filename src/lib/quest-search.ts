import type { Quest, QuestDataset, QuestFish, QuestRod, QuestTask } from './quests';
export const questFilterDefaults={location:'',type:'',status:'available'};
export type QuestFilters=typeof questFilterDefaults;
export const fold=(s:string)=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export const questTasks=(q:Quest)=>q.stages.filter(s=>!s.archived).flatMap(s=>s.steps.flatMap(step=>step.tasks));
export function questOptions(quests:Quest[]) { return {location:[...new Set(quests.flatMap(q=>q.locations))].sort((a,b)=>a.localeCompare(b)),type:[...new Set(quests.map(q=>q.type))].sort((a,b)=>a.localeCompare(b))}; }
export function findQuests(quests:Quest[],query:string,filters:QuestFilters,sort:string){const needle=fold(query);return quests.filter(q=>{
 if(filters.location&&!q.locations.includes(filters.location)||filters.type&&q.type!==filters.type||filters.status&&q.status!==filters.status)return false;
 return !needle||[q.name,q.npc,...q.locations,...q.events,q.description,...q.rewards,...q.stages.flatMap(s=>[s.name,...s.steps.flatMap(step=>[step.title,...step.tasks.map(t=>t.text)])]),...q.notes.flatMap(b=>[...b.paragraphs,...b.tables.flatMap(t=>t.rows.flat())])].some(s=>fold(s).includes(needle));
 }).sort((a,b)=>(sort==='name-desc'?b.name.localeCompare(a.name):sort==='location-asc'?a.locations.join().localeCompare(b.locations.join()):0)||a.name.localeCompare(b.name));}
export const fishMatch=(data:QuestDataset,page:string):QuestFish|undefined=>{const needle=fold(page);return needle?data.fish.find(f=>fold(f.page)===needle||fold(f.name)===needle):undefined;};
export const rodMatch=(data:QuestDataset,page:string):QuestRod|undefined=>{const needle=fold(page);return needle?data.rods.find(r=>fold(r.page)===needle||fold(r.name)===needle):undefined;};
// These are capacity candidates, not guarantees about passives or mutations.
export function capacityRods(data:QuestDataset,fish:QuestFish){if(fish.maximumWeight==null||fish.maximumWeight<=0)return [];return data.rods.filter(r=>!r.unavailable&&r.maximumWeight!=null&&r.maximumWeight>=fish.maximumWeight!).sort((a,b)=>a.maximumWeight!-b.maximumWeight!||a.name.localeCompare(b.name)).slice(0,3);}
export const taskProgressKey=(quest:Quest,task:QuestTask)=>`${quest.id}:${task.id}`;
export function readQuestProgress(value:string|null):Record<string,true>{try{const data=JSON.parse(value??'{}');if(!data||Array.isArray(data)||typeof data!=='object')return {};return Object.fromEntries(Object.entries(data).filter(([k,v])=>/^\d+:[a-z0-9]+$/.test(k)&&v===true).slice(0,10000)) as Record<string,true>;}catch{return {};}}
