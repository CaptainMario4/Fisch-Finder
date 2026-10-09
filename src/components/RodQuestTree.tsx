import { useEffect, useMemo, useState } from 'react';
import type { Rod } from '../lib/rods';
import type { QuestDataset } from '../lib/quests';
import { fold } from '../lib/quest-search';
import { obtainQuestUrl, obtainWikiUrl } from '../lib/rod-obtainment';
import { matchPathQuest, pathReferencedRods, rodQuestPaths } from '../lib/rod-quest-path';
import { purchasePath } from '../lib/rod-purchase';
import type { AreaAccessGuide } from '../lib/rod-purchase';
import type { ObtainStep } from '../lib/rod-obtainment';
import type { PathQuest, PathStage, PathObjective, PathMethod, PathRod } from '../lib/rod-quest-path';

type TreeContext={rods:Rod[];data?:QuestDataset;request:()=>void;loading:boolean;error:string;path:string[];depth:number};
const roleLabels={required:'Required by objective',accepted:'Accepted rod option',objective:'Objective-specific rod',suggested:'Suggested method'};
function Connector(){return <div className="rod-path-connector" aria-hidden="true">↓</div>;}
function RodChoice({choice,ctx}:{choice:PathRod;ctx:TreeContext}){
 const [expanded,setExpanded]=useState(false);
 const rod=ctx.rods.find(r=>fold(r.page)===fold(choice.page)||fold(r.name)===fold(choice.name));
 const repeated=ctx.path.some(page=>fold(page)===fold(rod?.page??choice.page));
 return <article className="rod-path-card rod-path-rod">
  <div className="rod-path-card-heading"><span className="rod-path-icon" aria-hidden="true">↟</span><div><span className="rod-obtain-kind">{roleLabels[choice.role]}</span><h5>{choice.name}</h5></div></div>
  {choice.recommended&&<p className="rod-path-recommendation"><strong>Recommended</strong> · {choice.recommended}</p>}
  {rod?.level&&<p className="rod-path-meta">Level {rod.level}</p>}
  {(choice.unavailable||rod?.unavailable)&&<p className="rod-obtain-warning">Limited or marked unavailable. Use only if already owned or its source is available.</p>}
  <a href={rod?.url??obtainWikiUrl({kind:'rod',page:choice.page,name:choice.name,quantity:'',attributes:''})} target="_blank" rel="noopener noreferrer">Rod source ↗</a>
  {rod&&!repeated&&ctx.depth<3&&<details className="rod-path-expand" onToggle={event=>setExpanded(event.currentTarget.open)}><summary>Show {rod.name} prerequisites</summary>{expanded&&<><Connector/><TreeRequirements rod={rod} ctx={{...ctx,path:[...ctx.path,rod.page],depth:ctx.depth+1}}/></>}</details>}
  {repeated&&<p className="rod-obtain-note">Already part of this path. Check another method to avoid a circular prerequisite.</p>}
  {rod&&ctx.depth>=3&&!repeated&&<p className="rod-obtain-note">Continue in Quest Helper or the rod source for deeper prerequisites.</p>}
 </article>;
}
function MutationMethod({method,ctx}:{method:PathMethod;ctx:TreeContext}){
 const [first,...others]=method.rods;
 return <section className="rod-path-method"><h5>{method.name}</h5><p>{method.note}</p>
  {first&&<><Connector/><RodChoice choice={first} ctx={ctx}/></>}
  {others.length>0&&<details className="rod-path-alternatives"><summary>{others.length} other rod option{others.length===1?'':'s'}</summary><div className="rod-path-choice-list">{others.map(option=><RodChoice key={option.page} choice={option} ctx={ctx}/>)}</div></details>}
  {!first&&method.sources.length>0&&<a href={obtainWikiUrl({kind:'wiki',page:method.sources[0],name:method.name,quantity:'',attributes:''})} target="_blank" rel="noopener noreferrer">Method source ↗</a>}
 </section>;
}
function Objective({objective,ctx}:{objective:PathObjective;ctx:TreeContext}){
 const {task,rods,methods}=objective;
 return <div className="rod-path-objective"><p className="rod-path-objective-text">{task.text}</p>
  {objective.stepTitle&&<p className="rod-path-meta">{objective.stepTitle}</p>}
  {task.solutions?.map((solution,i)=><p className="rod-path-solution" key={i}>Solution: {solution}</p>)}
  {rods.length>0&&<><Connector/><div className="rod-path-choice-list">{rods.map(option=><RodChoice key={option.page} choice={option} ctx={ctx}/>)}</div></>}
  {methods.length>0&&<div className="rod-path-methods">{methods.map(method=><MutationMethod key={method.name} method={method} ctx={ctx}/>)}</div>}
 </div>;
}
function Stage({entry,index,ctx}:{entry:PathStage;index:number;ctx:TreeContext}){
 return <li className="rod-path-child"><details className="rod-path-stage" open><summary><span className="rod-path-stage-number" aria-hidden="true">{index+1}</span><span>{entry.stage.name}</span></summary>
  <div className="rod-path-stage-body">{entry.variants&&<p className="rod-path-meta">The source has multiple entries for this stage; some objectives may be conditional. Follow Quest Helper’s instructions.</p>}{entry.objectives.map(objective=><Objective key={objective.task.id} objective={objective} ctx={ctx}/>)}</div>
 </details></li>;
}
function QuestBranch({entry,ctx}:{entry:PathQuest;ctx:TreeContext}){
 const {quest,reference,stages}=entry;
 const linkRef=quest?{...reference,page:quest.page,name:quest.npc}:reference;
 return <li className="rod-path-child rod-path-quest-branch"><article className="rod-path-card rod-path-quest"><span className="rod-obtain-kind">Quest guide</span><h4>{quest?.npc??reference.name}</h4>
  {quest&&<p className="rod-path-meta">{quest.locations.join(' · ')}{quest.status==='unavailable'?' · Unavailable':quest.status==='unknown'?' · Check availability':''}</p>}
  <a href={obtainQuestUrl(linkRef)}>Open Quest Helper ↗</a>
  {!quest&&<p className="rod-obtain-note" role="status">{!ctx.data&&!ctx.error?'Loading quest objectives…':'This quest is not in the imported guide. Check the linked quest or source for its requirements.'}</p>}
  {quest&&!entry.scoped&&<p className="rod-obtain-note">Associated NPC quests. Confirm the required stage and unlock order in Quest Helper.</p>}
  {entry.omittedSelfTasks&&<p className="rod-obtain-note">Tasks that already use the selected rod are excluded from its prerequisites.</p>}
 </article>
 {stages.length>0&&<><Connector/><ol className="rod-path-children rod-path-stages" data-count={stages.length} aria-label={'Quest stages for '+(quest?.npc??reference.name)}>{stages.map((stage,index)=><Stage key={stage.stage.id} entry={stage} index={index} ctx={ctx}/>)}</ol></>}
 </li>;
}
function AccessSteps({steps,ctx}:{steps:ObtainStep[];ctx:TreeContext}){
 const refs=steps.flatMap(step=>step.references).filter((ref,index,all)=>all.findIndex(r=>fold(r.page)===fold(ref.page))===index);
 const questRefs=steps.filter(step=>/\bquest\b/i.test(step.text)).flatMap(step=>step.references);
 const questLinks=ctx.data?refs.filter(ref=>questRefs.some(r=>r.page===ref.page)).flatMap(ref=>{const quest=matchPathQuest(ref,ctx.data!);return quest?[{...ref,page:quest.page,name:quest.npc}]:[];}):[];
 const rodChoices=refs.flatMap(ref=>{const rod=ctx.rods.find(r=>fold(r.page)===fold(ref.page));const optional=steps.some(step=>step.text.split(/(?<=[.!?])\s+/).some(sentence=>sentence.includes(ref.name)&&/\b(?:recommended|suggested|optional)\b/i.test(sentence)));return rod&&!ctx.path.some(page=>fold(page)===fold(rod.page))?[{rod,role:optional?'suggested' as const:'objective' as const}]:[];});
 return <><div className="rod-purchase-steps">{steps.map((step,index)=><p key={index}>{step.text}</p>)}</div>
  {questLinks.length>0&&<div className="rod-obtain-links">{questLinks.map(ref=><a key={ref.page} href={obtainQuestUrl(ref)}>Quest Helper: {ref.name} ↗</a>)}</div>}
  {rodChoices.length>0&&<><Connector/><div className="rod-path-choice-list">{rodChoices.map(({rod,role})=><RodChoice key={rod.page} choice={{page:rod.page,name:rod.name,role,unavailable:rod.unavailable}} ctx={ctx}/>)}</div></>}
 </>;
}
function AccessGuide({guide,ctx,equipment=false}:{guide:AreaAccessGuide;ctx:TreeContext;equipment?:boolean}){
 return <article className="rod-path-card rod-path-access"><span className="rod-obtain-kind">{equipment?'Access equipment':'Area access & preparation'}</span><h4>{guide.region}</h4>
  <AccessSteps steps={guide.steps} ctx={ctx}/>
  {!guide.steps.length&&<p className="rod-obtain-note">Access requirements not documented in the imported guide. Check the area source before travelling.</p>}
  <a href={obtainWikiUrl({kind:'wiki',page:guide.page,name:guide.region,quantity:'',attributes:''})+(guide.page!==guide.region?'#'+encodeURIComponent(guide.region.replace(/ /g,'_')):'')} target="_blank" rel="noopener noreferrer">{equipment?'Equipment':'Area'} source ↗</a>
  {guide.fetchedAt&&<p className="rod-purchase-source-date">Source checked: {guide.fetchedAt.replace('T',' ').replace(/\.\d+Z$/,' UTC')}</p>}
 </article>;
}
function PurchaseBranch({rod,ctx}:{rod:Rod;ctx:TreeContext}){
 const path=purchasePath(rod)!;const access=rod.purchaseAccess;
 const guideSteps=[...(access?.area?.steps??[]),...(access?.equipment.flatMap(guide=>guide.steps)??[])];
 useEffect(()=>{if(guideSteps.some(step=>/\bquest\b/i.test(step.text)&&step.references.length))ctx.request();},[rod.purchaseAccess,ctx.request]);
 return <li className="rod-path-child rod-purchase-branch"><article className="rod-path-card rod-path-purchase"><span className="rod-obtain-kind">{path.alternative?'Purchase option':'Purchase location'}</span><h4>{path.location?'Buy in '+path.location:'Purchase this rod'}</h4>
  <dl className="rod-purchase-facts"><div><dt>Location</dt><dd>{path.location||'Not listed by the source'}</dd></div><div><dt>Rod price</dt><dd>{path.price||'Not listed by the source'}</dd></div></dl>
  {path.steps.length>0&&<AccessSteps steps={path.steps} ctx={ctx}/>}{path.hint&&<p>{path.hint}</p>}
  {rod.unavailable&&<p className="rod-obtain-warning">Marked unavailable. This purchase route may be historical.</p>}
  <a href={rod.url+'#Obtainment'} target="_blank" rel="noopener noreferrer">{rod.secondary?'Fisch Fandom':'Fischipedia'} purchase instructions ↗</a>
 </article><Connector/>
 {access?.area?<div className="rod-purchase-access"><AccessGuide guide={access.area} ctx={ctx}/>{access.equipment.length>1&&<p className="rod-obtain-note rod-path-none">Equipment mentioned by the area guide is shown below. Follow its stated alternatives; not every option must be purchased.</p>}{access.equipment.map(guide=><div key={guide.region}><Connector/><AccessGuide guide={guide} ctx={ctx} equipment/></div>)}
  {(access.area.equipment.length>access.equipment.length)&&<p className="rod-obtain-note">Some equipment acquisition steps were not imported. Check the linked area source.</p>}
 </div>:<p className="rod-obtain-note rod-path-none">Access requirements not documented in the imported guide. Check the purchase source for entrance unlocks and equipment before travelling.</p>}
 </li>;
}
export function TreeRequirements({rod,ctx}:{rod:Rod;ctx:TreeContext}){
 const quests=useMemo(()=>rodQuestPaths(rod,ctx.rods,ctx.data),[rod,ctx.rods,ctx.data]);
 const direct=useMemo(()=>pathReferencedRods(rod,ctx.rods),[rod,ctx.rods]);
 useEffect(()=>{if(quests.length)ctx.request();},[quests.length,ctx.request]);
 const nonQuestRods=direct.filter(r=>!quests.some(q=>q.stages.some(s=>s.objectives.some(o=>o.rods.some(option=>fold(option.page)===fold(r.page))))));
 const purchase=purchasePath(rod);
 if(!quests.length&&!nonQuestRods.length&&!purchase)return <p className="rod-obtain-note rod-path-none">No quest or specific rod prerequisite is listed in the imported source. Use the obtainment instructions for purchases, crafting materials, locations and other conditions.</p>;
 return <ul className="rod-path-children" aria-label={'Quest and rod prerequisites for '+rod.name}>
  {purchase&&<PurchaseBranch rod={rod} ctx={ctx}/>}
  {quests.map(entry=><QuestBranch key={entry.reference.page} entry={entry} ctx={ctx}/>)}
  {nonQuestRods.map(r=><li className="rod-path-child" key={r.page}><RodChoice choice={{page:r.page,name:r.name,role:'objective',unavailable:r.unavailable}} ctx={ctx}/></li>)}
 </ul>;
}
export default function RodQuestTree({rod,rods,data,request,loading,error}:{rod:Rod;rods:Rod[];data?:QuestDataset;request:()=>void;loading:boolean;error:string}){
 const ctx:TreeContext={rods,data,request,loading,error,path:[rod.page],depth:0};
 return <div className="rod-obtain-recipe rod-quest-tree"><div className="rod-path-card rod-path-target"><span className="rod-obtain-kind">Desired rod</span><h3>{rod.name}</h3>
  <div className="rod-path-badges">{(rod.level||rod.obtainment?.level)&&<span>Required level: {rod.level||rod.obtainment?.level}</span>}{rod.unavailable&&<span>Limited / unavailable</span>}</div>
  <a href={rod.url+'#Obtainment'} target="_blank" rel="noopener noreferrer">View {rod.secondary?'Fisch Fandom':'Fischipedia'} obtainment ↗</a>
 </div><Connector/><TreeRequirements rod={rod} ctx={ctx}/>
 {error&&<p className="rod-obtain-warning" role="status">{error}</p>}
 </div>;
}
