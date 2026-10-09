import { useMemo, useState } from 'react';
import type { Rod } from '../lib/rods';
import { rodObtainmentNodes, obtainQuestUrl, obtainWikiUrl } from '../lib/rod-obtainment';
import type { ObtainNode } from '../lib/rod-obtainment';
import '../styles/rod-obtainment.css';

const fold=(text:string)=>text.toLowerCase().replace(/[^a-z0-9]/g,'');
const labels:Record<ObtainNode['kind'],string>={level:'Level',quest:'Quest',event:'Event',price:'Currency',rod:'Rod',fish:'Fish',item:'Item',wiki:'Wiki reference'};
function Requirement({node,rods,path,depth}:{node:ObtainNode;rods:Rod[];path:string[];depth:number}) {
 const [expanded,setExpanded]=useState(false);
 const ref=node.reference,rod=node.kind==='rod'&&ref?rods.find(r=>fold(r.page)===fold(ref.page)):undefined;
 const repeated=!!rod&&path.some(page=>fold(page)===fold(rod.page));
 return <li className={'rod-obtain-node rod-obtain-node-'+node.kind}>
  <span className="rod-obtain-kind">{labels[node.kind]}</span>
  <h4>{node.title}</h4><p>{node.detail}</p>
  {rod?.unavailable&&<p className="rod-obtain-warning">Limited or marked unavailable; check obtainment before relying on it.</p>}
  {ref&&node.kind==='quest'&&<a href={obtainQuestUrl(ref)}>Open Quest Helper ↗</a>}
  {ref&&node.kind==='fish'&&<a href={'/?'+new URLSearchParams({q:ref.page,fish:ref.page}).toString()}>Find this fish ↗</a>}
  {ref&&node.kind!=='quest'&&<a href={obtainWikiUrl(ref)} target="_blank" rel="noopener noreferrer">How to obtain on Fischipedia ↗</a>}
  {rod&&!repeated&&depth<3&&<details className="rod-obtain-branch" onToggle={event=>setExpanded(event.currentTarget.open)}><summary>Show {rod.name} prerequisites</summary>{expanded&&<RecipeBranch rod={rod} rods={rods} path={[...path,rod.page]} depth={depth+1}/>}</details>}
  {repeated&&<p className="rod-obtain-note">Already shown earlier in this branch. Follow the source for alternative routes.</p>}
  {rod&&depth>=3&&!repeated&&<p className="rod-obtain-note">Further dependencies are available in the linked source.</p>}
 </li>;
}
function Instructions({rod}:{rod:Rod}) {
 const sections=rod.obtainment?.sections??[];
 return <details className="rod-obtain-instructions"><summary>Full wiki obtainment instructions {sections.length?'('+sections.length+' source section'+(sections.length===1?'':'s')+')':''}</summary>
  {sections.length?sections.map((section,i)=><section key={i}><h4>{section.heading}</h4><ol>{section.steps.map((step,j)=><li key={j}><p>{step.text}</p>{step.references.some(r=>r.kind==='quest')&&<div className="rod-obtain-links">{step.references.filter(r=>r.kind==='quest').map(ref=><a key={ref.page} href={obtainQuestUrl(ref)}>Quest: {ref.name} ↗</a>)}</div>}</li>)}</ol></section>):<p>No detailed steps were imported. {rod.hint||'Check the full source for materials, unlocks and conditions.'}</p>}
  <a href={rod.url+'#Obtainment'} target="_blank" rel="noopener noreferrer">Read the complete source ↗</a>
 </details>;
}
function RecipeBranch({rod,rods,path,depth=0}:{rod:Rod;rods:Rod[];path:string[];depth?:number}) {
 const nodes=useMemo(()=>rodObtainmentNodes(rod,rods),[rod,rods]);
 return <div className="rod-obtain-recipe">
  {nodes.length>0?<ul className="rod-obtain-inputs" aria-label={'Referenced requirements for '+rod.name}>{nodes.map(node=><Requirement key={node.id} node={node} rods={rods} path={path} depth={depth}/>)}</ul>:<p className="rod-obtain-note">No structured prerequisites are listed. Check the instructions and source below.</p>}
  <div className="rod-obtain-connector" aria-hidden="true"><span>↓</span></div>
  <div className="rod-obtain-output"><span className="rod-obtain-kind">Selected rod</span><h3>{rod.name}</h3><p>{rod.source|| (rod.quest?'Quest reward':'Obtainment method not listed')}{rod.region?' · '+rod.region:''}</p>
   {rod.unavailable&&<p className="rod-obtain-warning">Marked unavailable. This guide does not imply the rod can currently be obtained.</p>}
   <a href={rod.url+'#Obtainment'} target="_blank" rel="noopener noreferrer">View {rod.secondary?'Fisch Fandom':'Fischipedia'} source ↗</a>
  </div>
  <Instructions rod={rod}/>
 </div>;
}
export default function RodObtainmentViewer({rod,rods,select,loading}:{rod?:Rod;rods:Rod[];select:(page:string)=>void;loading:boolean}) {
 return <section className="rod-obtainment-viewer" id="rod-obtainment-viewer" tabIndex={-1} aria-labelledby="rod-obtainment-title">
  <header className="rod-obtain-header"><div><p className="rod-obtain-eyebrow">Plan your unlock</p><h2 id="rod-obtainment-title">{rod?'How to obtain '+rod.name:'Rod obtainment viewer'}</h2><p>Follow the requirements and expand prerequisite rods.</p></div><label><span>Choose a rod for the obtainment viewer</span><select value={rod?.page??''} onChange={event=>select(event.target.value)}><option value="">Select a rod</option>{rods.map(r=><option key={r.page} value={r.page}>{r.name}{r.unavailable?' · Unavailable':''}</option>)}</select></label></header>
  {rod?<><p className="rod-obtain-note">These cards collect references from the wiki; they are not all necessarily consumed ingredients or a strict unlock order. Follow the source instructions for alternatives, quantities, locations and special conditions.</p>
   {rod.secondary&&<p className="rod-obtain-warning">From Fisch Fandom · provisional. Only imported summary fields are shown; detailed primary-wiki instructions are not available yet.</p>}
   {!rod.obtainment&&!rod.secondary&&<p className="rod-obtain-note" role="status">{loading?'Loading detailed wiki obtainment instructions…':'Detailed instructions are not in the saved data. Known level, price, quest and event requirements remain available; use the source link for the rest.'}</p>}
   <RecipeBranch key={rod.page} rod={rod} rods={rods} path={[rod.page]}/>
  </>:<div className="rod-obtain-empty"><h3>Select your next rod</h3><p>Choose a table row, mobile card, or the selector above to see its obtainment plan here. Rod details and filters continue to work as usual.</p></div>}
 </section>;
}
