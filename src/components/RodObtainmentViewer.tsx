import type { Rod } from '../lib/rods';
import { obtainQuestUrl } from '../lib/rod-obtainment';
import RodQuestTree from './RodQuestTree';
import { useRodQuests } from '../lib/use-rod-quests';
import '../styles/rod-obtainment.css';

function Instructions({rod}:{rod:Rod}) {
 const sections=rod.obtainment?.sections??[];
 return <details className="rod-obtain-instructions"><summary>Full wiki obtainment instructions {sections.length?'('+sections.length+' source section'+(sections.length===1?'':'s')+')':''}</summary>
  {sections.length?sections.map((section,i)=><section key={i}><h4>{section.heading}</h4><ol>{section.steps.map((step,j)=><li key={j}><p>{step.text}</p>{step.references.some(r=>r.kind==='quest')&&<div className="rod-obtain-links">{step.references.filter(r=>r.kind==='quest').map(ref=><a key={ref.page} href={obtainQuestUrl(ref)}>Quest: {ref.name} ↗</a>)}</div>}</li>)}</ol></section>):<p>No detailed steps were imported. {rod.hint||'Check the full source for materials, unlocks and conditions.'}</p>}
  <a href={rod.url+'#Obtainment'} target="_blank" rel="noopener noreferrer">Read the complete source ↗</a>
 </details>;
}
export default function RodObtainmentViewer({rod,rods,select,loading}:{rod?:Rod;rods:Rod[];select:(page:string)=>void;loading:boolean}) {
 const quests=useRodQuests();
 return <section className="rod-obtainment-viewer" id="rod-obtainment-viewer" tabIndex={-1} aria-labelledby="rod-obtainment-title">
  <header className="rod-obtain-header"><div><p className="rod-obtain-eyebrow">Plan your unlock</p><h2 id="rod-obtainment-title">{rod?'How to obtain '+rod.name:'Rod obtainment viewer'}</h2><p>Start with your desired rod, then follow crafting, purchase, quest and rod requirements downward.</p></div><label><span>Choose a rod for the obtainment viewer</span><select value={rod?.page??''} onChange={event=>select(event.target.value)}><option value="">Select a rod</option>{rods.map(r=><option key={r.page} value={r.page}>{r.name}{r.unavailable?' · Unavailable':''}</option>)}</select></label></header>
  {rod?<><p className="rod-obtain-note">Expand the rods you need. Crafting recipes include materials, attributes and Ancient Archives access. Shop rods show purchase locations and area preparation. Objective-specific rods and optional mutation methods are labelled separately; keep the quest’s exact conditions and alternatives.</p>
   {rod.secondary&&<p className="rod-obtain-warning">From Fisch Fandom · provisional. Only imported summary fields are shown; detailed primary-wiki instructions are not available yet.</p>}
   {!rod.obtainment&&!rod.secondary&&<p className="rod-obtain-note" role="status">{loading?'Loading detailed wiki obtainment instructions…':'Detailed instructions are not in the saved data. Known quest and rod requirements remain available; use the source link for the rest.'}</p>}
   <RodQuestTree key={rod.page} rod={rod} rods={rods} data={quests.data} request={quests.request} loading={quests.loading} error={quests.error}/><Instructions rod={rod}/>
  </>:<div className="rod-obtain-empty"><h3>Select your next rod</h3><p>Choose a table row, mobile card, or the selector above to see its obtainment plan here. Rod details and filters continue to work as usual.</p></div>}
 </section>;
}
