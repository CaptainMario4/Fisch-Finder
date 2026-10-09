import type { QuestTask, QuestDataset } from './quests';
import { fishMatch, rodMatch, fold } from './quest-search';

export function giantRodOption(task:QuestTask,data:QuestDataset) {
 if(!task.mutations.some(name=>fold(name)==='giant')||task.rods.length||task.mutations.some(name=>!['giant','shiny','sparkling','sirensspite'].includes(fold(name))))return undefined;
 if(task.fish.some(ref=>{const fish=fishMatch(data,ref.page);return fish?.methods.length&&!fish.methods.some(method=>/fishing rod/i.test(method));}))return undefined;
 const rod=rodMatch(data,'Evil Pitchfork');return rod&&!rod.unavailable?rod:undefined;
}
type MethodGuide = { summary:string; notes:string[]; sources:string[]; limited?:boolean };
const methodGuides:Record<string,MethodGuide>={
 albino:{summary:'Noir enchantment on a suitable rod (50% Albino chance).',notes:['Natural fishing and appraisal are alternatives. Use appraisal only if the objective permits it; keep any fresh-catch requirement.'],sources:['Albino','Enchanting']},
 mosaic:{summary:'Natural fishing, or appraisal if the objective permits it; no dedicated Mosaic rod is documented.',notes:['Mosaic is a rare natural mutation (0.36% base fishing chance). Meet Shiny and any other attributes separately; appraisal does not replace a fresh-catch requirement.'],sources:['Mosaic']},
 anomalous:{summary:'Anomalous enchantment: a 20% chance to duplicate the catch, with Anomalous on the duplicate.',notes:['The mutation is guaranteed on the qualifying duplicate, not on every cast. Confirm that duplicated fish satisfy the objective before relying on this method.'],sources:['Anomalous','Enchanting']},
 bluemoon:{summary:'Fish during a Blue Moon event; documented 10% Blue Moon mutation chance.',notes:['Use a rod suited to the target fish. The event mutation does not guarantee the target fish or a Perfect Catch.'],sources:['Blue Moon']},
 putrid:{summary:'Recommended for repeated attempts: Putrid enchantment from a Twisted Relic (2% mutation chance).',notes:['Use a suitable rod and preserve any Perfect Catch condition. The enchantment reduces Luck by 10%.','Optional alternative: Him companion. Its passive runs every 60 minutes, or every 30 minutes at max level. The documented 50% Putrid roll applies to its fish reward, not to every catch; this is not a replacement for a required Perfect Catch.'],sources:['Twisted Relic','Putrid','Him (Companion)']},
 entrenched:{summary:'Trench Grubs bait with a suitable rod (10% Entrenched chance).',notes:['Natural fishing in Outer Deep, Lower Deep and Gloomy Crevice is another documented route. Appraisal is an alternative only when the objective allows it.'],sources:['Entrenched','Trench Grubs']},
 sovereign:{summary:'Propensity Spirit enchantment: a 15% chance to duplicate the catch, with Sovereign on the duplicate.',notes:['Alternative: fish in a Sovereign Beam Pool during Sovereign Surge, Sovereign Storm or Sovereign Reckoning. Neither route guarantees the target fish; check whether the objective accepts duplicates.'],sources:['Sovereign','Enchanting']},
 moonkissed:{summary:'Blue Moon status effect (documented 5% Moon-Kissed chance).',notes:['Follow the Blue Moon event/status-effect conditions with a rod suited to the target fish. Blue Moon and Moon-Kissed are different mutations; use whichever the objective actually accepts.'],sources:['Moon-Kissed','Blue Moon']},
 singularity:{summary:'For Lyren’s Final Convergence, use an accepted alternative such as Aurora; Singularity is not mandatory.',notes:['Lyren’s objective accepts Celestial, Nova, Aurora, Umbra, Singularity, Cosmos or Lunar. Consult the listed methods for your chosen alternative and the specific fish in your Quest Book. A standalone Singularity method is not verified here.'],sources:['Lyren']},
 lovely:{summary:'Valentine’s enchantment, if already owned (15% Lovely chance).',limited:true,notes:['Limited / event-exclusive: the enchantment is obtained using a Valentine’s Relic associated with Valentides. Do not assume the relic can currently be obtained. Existing owned supplies are an option; check the source for event availability.','Natural Lovely fishing requires the Valentides event and an active duo. The quest target itself may also be unavailable outside its event.'],sources:['Lovely',"Valentine's Relic",'Valentides 2']},
 big:{summary:'Use size/weight bonuses on a suitable rod; Big is a size condition, not a rod-specific mutation.',notes:['Big occurs above base weight; Giant occurs above 1.99× base weight. For an exact Big objective, verify whether Giant is accepted before using a large weight boost such as Evil Pitchfork.','For Wind Master’s Shiny + Big Bait Crate, meet both attributes. Size bonuses do not provide Shiny; use appraisal only if permitted, and preserve fresh-catch conditions.'],sources:['Sizes','Wind Master']},
 radiant:{summary:'Golden Coin bait with a suitable rod (documented 100% Radiant mutation chance).',notes:['This guarantees the listed mutation effect, not the target fish. Follow any required catch location, fish, rod or combination. Check the bait source for obtainment requirements.'],sources:['Radiant','Golden Coin (Bait)']},
};
export function methodGuide(name:string,task?:QuestTask):MethodGuide|undefined {
 // Do not generalize Lyren’s explicitly documented alternatives to another quest.
 if(fold(name)==='singularity'&&(!task||!task.mutations.some(n=>fold(n)==='aurora')||!task.solutions?.some(text=>/either.*singularity/i.test(text))))return undefined;
 return methodGuides[fold(name)];
}
const preferredMutationRods:Record<string,{page:string;reason:string}>={
 mythical:{page:'Mythical Rod',reason:'30% base chance; 35% with mastery. Permanent merchant route.'},
 shiny:{page:"Pinion's Aria",reason:'Adds 14.2% Shiny chance; 22% with mastery. Permanent quest reward.'},
 sparkling:{page:'Destiny Rod',reason:'Adds 10% chance; 15% with mastery. Straightforward passive with a permanent purchase route.'},
 frozen:{page:'Arctic Rod',reason:'100% Frozen chance. Permanent purchase route.'},
 hexed:{page:'No-Life Rod',reason:'50% Hexed chance. Permanent level reward.'},
 lunar:{page:'Moonlit Rod',reason:'100% Lunar during Moonlit Mirage; requires that event. Permanent Shady Bazaar route.'},
 solarblaze:{page:'Wicked Fang Rod',reason:'30% Solarblaze chance. Recurring purchase route; check its Eclipse purchase condition.'},
 greedy:{page:'Rod Of The Eternal King',reason:'60% Greedy chance. Permanent crafting route.'},
 blessed:{page:'Seraphic Rod',reason:'35% base chance; 50% with mastery. Permanent level reward.'},
 wrath:{page:'Rod Of The Zenith',reason:'70% Wrath chance. Permanent purchase route.'},
 spirit:{page:'Spiritbinder',reason:'10% direct chance, with guaranteed Spirit on qualifying passive/duplicated fish. Permanent crafting route; verify quest acceptance of passive fish.'},
 serene:{page:'Duskwire',reason:'2% base; 3% after a Perfect Catch, or 5%/10% with mastery. Permanent quest and purchase route.'},
 nova:{page:'Rod of the Singularity',reason:'25.92% Nova chance. Permanent Merlin quest reward.'},
};
// Compare only explicit, unconditional base chances from the primary wiki.
// Event, mastery-only, duplicate and meter effects are deliberately not scored.
export function automaticMutationRod(name:string,data:QuestDataset) {
 const mutation=data.mutations.find(m=>fold(m.name)===fold(name)||fold(m.page)===fold(name));
 if(!mutation||new Set(mutation.rods.map(r=>fold(r.page))).size<3||!mutation.url.startsWith('https://fischipedia.org/wiki/'))return undefined;
 const reviewed=preferredMutationRods[fold(mutation.name)];
 const eligible=(page:string)=>{
  const rod=rodMatch(data,page);
  return !!rod&&!rod.unavailable&&(rod.permanentRoute===true||(rod.permanentRoute===undefined&&!!reviewed&&fold(reviewed.page)===fold(page)));
 };
 const candidates=mutation.rods.flatMap(ref=>{
  if(!eligible(ref.page))return [];
  const names=[ref.name,ref.page];
  const rates=mutation.notes.flatMap(note=>{
   const prefix=names.find(n=>note.toLowerCase().startsWith(n.toLowerCase()));
   if(!prefix)return [];
   const rest=note.slice(prefix.length);
   const match=rest.match(/^,?\s+(?:at (?:a |an )?|increasing chance by )(\d+(?:\.\d+)?)%\s*(?:chance)?\s*\.\s*(.*)$/i);
   if(!match)return [];
   // Later mastery information is separate; conditions on the base statement
   // cannot match the complete first sentence above.
   const rate=Number(match[1]);return rate>0&&rate<=100?[rate]:[];
  });
  return rates.length===1?[{page:ref.page,rate:rates[0]}]:[];
 }).sort((a,b)=>b.rate-a.rate);
 if(candidates.length&&(!candidates[1]||candidates[0].rate>candidates[1].rate)){
  const best=candidates[0];
  return {page:best.page,reason:`${best.rate}% documented ${['shiny','sparkling'].includes(fold(mutation.name))?'base chance increase':'base chance'}. Highest clear unconditional rate among eligible permanent rods; mastery and special triggers are not compared.`};
 }
 // Retain a reviewed conditional option only when no clear base-rate choice
 // exists. Never keep its label after the wiki removes the rod or its method.
 if(!candidates.length&&reviewed&&eligible(reviewed.page)&&mutation.rods.some(r=>fold(r.page)===fold(reviewed.page)))return reviewed;
 return undefined;
}
