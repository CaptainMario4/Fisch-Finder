import type { Rod } from './rods';
import type { CraftRecipe } from './rod-obtainment';
import type { AccessGuides } from './rod-purchase';
import { accessKey } from './rod-purchase';

export const CRAFTING_AREA='Ancient Archives';
export function craftingPath(rod:Rod){
 const sections=rod.obtainment?.sections??[];
 const craftingSections=sections.filter(section=>/craft/i.test(section.heading));
 const direct=/craft/i.test(rod.source);
 const recipes=rod.obtainment?.recipes??[];
 const summaries=recipes.map(recipe=>[recipe.level?'Required level: '+recipe.level:'',...recipe.ingredients.map(ref=>ref.name+(ref.quantity?' ×'+ref.quantity:'')+(ref.attributes?' ('+ref.attributes+')':'')),recipe.price?'Price: '+recipe.price:''].filter(Boolean).join(' · '));
 const steps=(craftingSections.length?craftingSections.flatMap(section=>section.steps):sections.flatMap(section=>section.steps).filter(step=>/\bcraft(?:ed|ing|able)?\b/i.test(step.text)))
  .map(step=>({...step,text:summaries.reduce((text,summary)=>summary?text.replace(summary,''):text,step.text).replace(/^Craftable [^.]*\.\s*/i,'').replace(/\bObtaining [^.]* (?:rewards|awards) [^.]* XP in the Rod Journal\.?/gi,'').trim()}))
  .filter(step=>step.text&&!/\.(?:png|jpg)\|/i.test(step.text));
 if(!direct&&!recipes.length&&!steps.length)return;
 // Older prose/list/table recipes can expose explicit counted materials. Never
 // turn every location, quest or journal reference into a crafting ingredient.
 const counted=(craftingSections.length?craftingSections.flatMap(section=>section.steps).flatMap(step=>step.references):rod.obtainment?.references??[])
  .filter(ref=>['item','fish'].includes(ref.kind)&&ref.quantity);
 const fallback:CraftRecipe[] = !recipes.length&&counted.length?[{ingredients:counted,level:rod.obtainment?.level||rod.level,price:rod.obtainment?.price||rod.price}]:[];
 const explicitLocation=steps.flatMap(step=>step.references.filter(ref=>step.text.toLowerCase().includes('crafted on '+ref.name.toLowerCase())))[0];
 const accessPage=explicitLocation?.page??CRAFTING_AREA;
 return {location:explicitLocation?.name??'Ancient Isle → Ancient Archives',accessPage,station:explicitLocation?'Source-described crafting station':'Crafting anvil',recipes:recipes.length?recipes:fallback,steps,hint:!steps.length?rod.hint:'',alternative:!direct};
}
export function attachCraftingAccess(rod:Rod,guides:AccessGuides):Rod{
 const path=craftingPath(rod);if(rod.secondary||!path)return rod;
 const area=guides[accessKey(path.accessPage)];
 return area?{...rod,craftingAccess:{area,equipment:area.equipment.flatMap(page=>guides[accessKey(page)]?[guides[accessKey(page)]]:[])}}:rod;
}
