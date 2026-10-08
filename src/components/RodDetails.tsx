import type { ReactNode } from 'react';
import type { Rod } from '../lib/rods';
import '../styles/fish-database.css';
import '../styles/rod-database.css';
const listed = (value: string) => value || 'Not listed';
function SearchIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.8" cy="10.8" r="7.3"/><path d="m16.2 16.2 4.3 4.3"/></svg>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <div className="fish-detail-field"><dt>{label}</dt><dd>{children}</dd></div>; }
function SourceText({text}:{text:string}) {
  const parts=text.split(/\s*•\s*/).filter(Boolean);
  return parts.length>1||text.trimStart().startsWith('•')?<>{!text.trimStart().startsWith('•')&&<p>{parts[0]}</p>}<ul>{(text.trimStart().startsWith('•')?parts:parts.slice(1)).map((part,index)=><li key={index}>{part}</li>)}</ul></>:<p>{text}</p>;
}
function RodAbilities({rod,loading}:{rod:Rod;loading:boolean}) {
  const abilities=rod.abilities??[],mastery=rod.mastery??[];
  const categories=[...new Set(abilities.map(ability=>ability.category))];
  return <section className="rod-abilities" aria-label="Rod abilities"><h3>Abilities</h3>{loading?<p className="rod-advice-note" role="status">Loading wiki abilities…</p>:!Array.isArray(rod.abilities)?<p className="rod-advice-note">Wiki abilities have not loaded. Retry or open the full source.</p>:abilities.length?<div className="rod-enchant-groups">{categories.map(category=><section key={category}><h4>{category}</h4><ul>{abilities.filter(ability=>ability.category===category).map((ability,index)=><li key={index}><SourceText text={ability.text}/>{ability.details.length>0&&<ul>{ability.details.map((text,index)=><li key={index}><SourceText text={text}/></li>)}</ul>}{ability.note&&<div className="rod-advice-note"><SourceText text={ability.note}/></div>}</li>)}</ul></section>)}</div>:<p className="rod-advice-note">No special ability listed in the wiki source.</p>}{mastery.length>0&&<details className="rod-mastery"><summary>Mastery rewards & conditions</summary>{rod.masteryLevel&&<p className="rod-advice-note">Mastery level requirement: {rod.masteryLevel}</p>}<div className="rod-enchant-groups">{mastery.map((task,index)=><section key={index}><h4>{task.name}</h4>{task.objective&&<SourceText text={task.objective}/>}<div><strong>Reward: </strong><SourceText text={task.reward||'Not listed'}/></div>{task.note&&<SourceText text={task.note}/>}</section>)}</div></details>}{!loading&&<a className="rod-source-link" href={`${rod.url}#Ability`} target="_blank" rel="noopener noreferrer">Read abilities on Fischipedia ↗</a>}</section>;
}
export default function RodDetails({ rod, close, context = 'finder', loading = false, notice = '', retry }: { rod: Rod | undefined; close: () => void; context?: 'finder' | 'quest'; loading?: boolean; notice?: string; retry?: () => void }) {
  const titleId = context === 'quest' ? 'quest-rod-title' : 'rod-detail-title';
  if (!rod) return <aside className="fish-detail" id={context === 'quest' ? 'quest-rod-detail' : 'rod-detail'} aria-label="Rod details"><div className="fish-detail-empty"><div className="fish-detail-symbol"><SearchIcon /></div><h2>Select a rod</h2><p>Choose a row to see all stats, obtainment information, and recommended enchants.</p><span>Search a rod, region, or enchant. Filter by any listed stage.</span></div></aside>;
  return <aside className="fish-detail" id={context === 'quest' ? 'quest-rod-detail' : 'rod-detail'} aria-label={`Details for ${rod.name}`}>
    <div className="fish-detail-heading"><div><p className="text-mute text-xs font-medium uppercase tracking-wide">{context === 'quest' ? 'Quest Helper / Rod details' : 'Fishing rod'}</p><h2 id={titleId}>{rod.name}</h2><p className="fish-detail-region">{listed(rod.region)}</p></div><button className="fish-close" onClick={close} aria-label="Close rod details">×</button></div>
    <div className="fish-detail-status"><span className="fish-tag">{rod.stage}</span><span className={`fish-tag ${rod.unavailable ? 'fish-tag-warning' : ''}`}>{rod.unavailable ? 'Unavailable' : 'Available'}</span></div>
    <div className="fish-detail-body">{notice && <p className="rod-advice-note" role="status">{notice}{retry && <button className="rod-retry" onClick={retry}>Retry loading details</button>}</p>}<h3>Rod stats</h3><dl className="fish-detail-list">
      <Field label="Lure speed">{listed(rod.lure)}</Field><Field label="Luck">{listed(rod.luck)}</Field><Field label="Control">{listed(rod.control)}</Field><Field label="Resilience">{listed(rod.resilience)}</Field><Field label="Max weight">{rod.maxWeight ? /inf|∞/i.test(rod.maxWeight) ? 'Unlimited' : `${rod.maxWeight} kg` : 'Not listed'}</Field><Field label="Durability">{listed(rod.durability)}</Field><Field label="Disturbance">{listed(rod.disturbance)}</Field><Field label="Hunt focus">{listed(rod.huntFocus)}</Field><Field label="Line distance">{rod.lineDistance ? `${rod.lineDistance} m` : 'Not listed'}</Field>
    </dl><RodAbilities rod={rod} loading={loading}/><h3 className="mt-lg">Preferred enchants</h3><p className="rod-advice-note">Fischipedia recommendations are subjective. The best choice depends on your goal, mastery, and available relics.</p>
    {rod.recommendations.length ? <div className="rod-enchant-groups">{(['Optimal grinding','Miscellaneous','Keeperbound'] as const).map(group => {
      const recommendations = rod.recommendations.filter(advice => advice.group === group);
      return recommendations.length ? <section key={group}><h4>{group}</h4><ul>{recommendations.map((advice, index) => <li key={index}><p>{advice.text}</p>{advice.note && <p className="rod-advice-note">{advice.note}</p>}</li>)}</ul></section> : null;
    })}</div> : <p className="rod-advice-note">No recommendation listed.</p>}
    <a className="rod-source-link" href={`${rod.url}#Enchanting`} target="_blank" rel="noopener noreferrer">Read enchant recommendations on Fischipedia ↗</a>
    <h3 className="mt-lg">Obtainment</h3><dl className="fish-detail-list"><Field label="Source">{listed(rod.source)}</Field><Field label="Price">{listed(rod.price)}</Field><Field label="Level required">{listed(rod.level)}</Field><Field label="Quest">{listed(rod.quest)}</Field><Field label="Event">{listed(rod.event)}</Field></dl>
    {rod.description && <div className="rod-description"><h4>Listed description</h4><p>{rod.description}</p></div>}
    {rod.hint && <div className="rod-description"><h4>Journal hint</h4><p>{rod.hint}</p></div>}
    <div className="fish-requirements"><strong>Check the full requirements</strong><p>Stages describe the wiki’s subjective obtainment difficulty. Availability reflects its removed / unobtainable flags; it does not confirm event availability in your server.</p><a href={`${rod.url}#Obtainment`} target="_blank" rel="noopener noreferrer">Read obtainment requirements ↗</a></div></div>
    <div className="fish-detail-footer"><a href={rod.url} target="_blank" rel="noopener noreferrer">Open full Fischipedia page ↗</a>{context === 'quest' && <div className="rod-popup-actions"><a href={`/rods?q=${encodeURIComponent(rod.page)}&rod=${encodeURIComponent(rod.page)}`}>Open in Rod Finder ↗</a><button onClick={close}>Back to quest</button></div>}</div>
  </aside>;
}

