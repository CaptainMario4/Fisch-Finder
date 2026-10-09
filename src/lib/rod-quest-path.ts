import type { Rod } from './rods';
import type { Quest, QuestDataset, QuestTask, QuestStage } from './quests';
import type { ObtainRef } from './rod-obtainment';
import { rodObtainmentNodes } from './rod-obtainment';
import { fold, rodMatch } from './quest-search';
import { automaticMutationRod, giantRodOption, methodGuide } from './quest-rod-guidance';

export type PathRod = { page:string; name:string; role:'required'|'accepted'|'objective'|'suggested'; unavailable:boolean; recommended?:string };
export type PathMethod = { name:string; rods:PathRod[]; note:string; sources:string[] };
export type PathObjective = { task:QuestTask; rods:PathRod[]; methods:PathMethod[]; stepTitle?:string };
export type PathStage = { stage:QuestStage; objectives:PathObjective[]; variants?:boolean };
export type PathQuest = { reference:ObtainRef; quest?:Quest; stages:PathStage[]; scoped:boolean; omittedSelfTasks:boolean };

const same=(a:string,b:string)=>fold(a.split('#')[0])===fold(b.split('#')[0]);
export function pathQuestReferences(rod:Rod,rods:Rod[]):ObtainRef[] {
 return rodObtainmentNodes(rod,rods).filter(n=>n.kind==='quest'&&n.reference).map(n=>n.reference!);
}
export function matchPathQuest(ref:ObtainRef,data:QuestDataset):Quest|undefined {
 const direct=data.quests.find(q=>same(q.page,ref.page));if(direct)return direct;
 const matches=data.quests.filter(q=>[q.name,q.npc].some(name=>same(name,ref.page)||same(name,ref.name)));
 return matches.length===1?matches[0]:undefined;
}
function isSelf(page:string,name:string,rod:Rod){return [rod.page,rod.name].some(target=>same(target,page)||same(target,name));}
function choice(page:string,name:string,role:PathRod['role'],data:QuestDataset):PathRod {
 const known=rodMatch(data,page);return {page:known?.page??page,name:known?.name??name,role,unavailable:known?.unavailable??false};
}
export function pathObjective(task:QuestTask,data:QuestDataset,rod:Rod):PathObjective {
 const alternatives=/\b(?:or|either)\b/i.test([task.text,...task.solutions??[]].join(' '));
 const explicit=task.rods.filter((r,i,all)=>!isSelf(r.page,r.name,rod)&&all.findIndex(other=>same(r.page,other.page))===i);
 const role:PathRod['role']=alternatives?'accepted':explicit.length===1&&/\b(?:using|use|with|requires?|equip)\b/i.test(task.text)?'required':'objective';
 const rods=explicit.map(ref=>choice(ref.page,ref.name,role,data));
 const methods=task.mutations.filter((name,i,all)=>all.findIndex(n=>fold(n)===fold(name))===i).map(name=>{
  const guide=methodGuide(name,task),mutation=data.mutations.find(m=>same(m.name,name)||same(m.page,name));
  // A different mutation rod must never replace a rod explicitly named by the objective.
  if(task.rods.length)return {name,rods:[],note:'Use the objective-specific rod above. Check Quest Helper for compatible enchantments and mutation methods.',sources:guide?.sources??[mutation?.page??name]};
  if(fold(name)==='giant'){
   const giant=giantRodOption(task,data);
   return {name:'Giant size',rods:giant&&!isSelf(giant.page,giant.name,rod)?[choice(giant.page,giant.name,'suggested',data)]:[],note:giant?'Optional weight-based method, not a guaranteed Giant catch. Evil Pitchfork applies Siren’s Spite; follow the objective’s other conditions.':'Giant is a size condition. Follow the objective’s required rod and other attributes.',sources:['Sizes']};
  }
  const best=automaticMutationRod(name,data);
  const options=(mutation?.rods??[]).filter((ref,i,all)=>!isSelf(ref.page,ref.name,rod)&&all.findIndex(r=>same(ref.page,r.page))===i).map(ref=>{
   const option=choice(ref.page,ref.name,'suggested',data);
   if(best&&same(best.page,option.page))option.recommended=best.reason;
   return option;
  }).sort((a,b)=>Number(b.recommended!=null)-Number(a.recommended!=null)||Number(a.unavailable)-Number(b.unavailable)||Number(rodMatch(data,b.page)?.permanentRoute===true)-Number(rodMatch(data,a.page)?.permanentRoute===true));
  return {name,rods:options,note:guide?.summary??(options.length?'Use one qualifying method; these rods are alternatives. Objective conditions take priority.':'No rod method is listed in the imported guide. Check Quest Helper for events, items or other methods.'),sources:guide?.sources??[mutation?.page??name]};
 });
 return {task,rods,methods};
}
export function rodQuestPaths(rod:Rod,rods:Rod[],data?:QuestDataset):PathQuest[] {
 return pathQuestReferences(rod,rods).map(reference=>{
  const quest=data?matchPathQuest(reference,data):undefined;
  if(!quest||!data)return {reference,quest,stages:[],scoped:false,omittedSelfTasks:false};
  const active=quest.stages.filter(stage=>!stage.archived);
  // An NPC can offer several unrelated rewards. Prefer the stages explicitly
  // named for this rod; otherwise retain the source collection without claiming an order.
  const named=active.filter(stage=>[rod.name,rod.page].some(name=>fold(stage.name).startsWith(fold(name))));
  const stages=named.length?named:active;let omittedSelfTasks=false;
  const paths=stages.flatMap(stage=>{
   const objectives=stage.steps.flatMap(step=>step.tasks.flatMap(task=>{
    const usesSelected=task.rods.some(ref=>isSelf(ref.page,ref.name,rod));
    if(usesSelected)omittedSelfTasks=true;
    return usesSelected?[]:[{...pathObjective(task,data,rod),stepTitle:/^Objectives?\s*\d*$/i.test(step.title)||step.title===task.text?undefined:step.title}];
   }));
   return objectives.length?[{stage,objectives}]:[];
  });
  const grouped:PathStage[]=[];
  for(const entry of paths){
   const existing=grouped.find(other=>other.stage.name===entry.stage.name);
   if(existing){existing.objectives.push(...entry.objectives);existing.variants=true;}else grouped.push(entry);
  }
  return {reference,quest,stages:grouped,scoped:!!named.length,omittedSelfTasks};
 });
}
export function pathReferencedRods(rod:Rod,rods:Rod[]):Rod[] {
 return rodObtainmentNodes(rod,rods).filter(n=>n.kind==='rod'&&n.reference).flatMap(node=>{
  const found=rods.find(r=>same(r.page,node.reference!.page));
  if(!found)return [];
  // A link in prose alone is often an example rod or an alternative. Only explicit
  // prerequisite wording earns a branch; all other references remain in source instructions.
  const required=rod.obtainment?.sections.some(section=>section.steps.some(step=>/\b(?:require[sd]?|must|need(?:s|ed)?|prerequisite|using|use|equip)\b/i.test(step.text)&&step.references.some(ref=>same(ref.page,found.page))));
  return required?[found]:[];
 }).filter((r,i,all)=>all.findIndex(other=>same(other.page,r.page))===i);
}
