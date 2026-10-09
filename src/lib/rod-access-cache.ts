import snapshot from '../data/rod-access-snapshot.json';
import type { Rod } from './rods';
import { accessKey, attachPurchaseAccess, extractAreaAccess, purchasePath, safeAccessPage } from './rod-purchase';
import type { AccessGuides } from './rod-purchase';
import { attachCraftingAccess, craftingPath } from './rod-crafting';

let guides:AccessGuides={...snapshot.guides} as AccessGuides;
type WikiRequest=(params:Record<string,string>)=>Promise<any>;
// Called inside the existing 30-minute rod refresh. Revalidate unique locations
// in batches, retrieve text only for changed revisions, and share equipment
// pages. No browser request, per-rod request, or forced refresh is added.
async function updateGuides(titles:string[],request:WikiRequest){
 const unique=[...new Set(titles.filter(safeAccessPage))].slice(0,100);
 for(let offset=0;offset<unique.length;offset+=50){
  const batch=unique.slice(offset,offset+50);
  const meta=await request({action:'query',titles:batch.join('|'),redirects:'1',prop:'revisions',rvprop:'ids'});
  if(!Array.isArray(meta.query?.pages))throw new Error('Missing area pages');
  const aliases=[...(meta.query.normalized??[]),...(meta.query.redirects??[])];
  const resolve=(title:string)=>{let next=title;const seen=new Set<string>();for(let i=0;i<10&&!seen.has(next);i++){seen.add(next);const alias=aliases.find(a=>accessKey(a.from)===accessKey(next));if(!alias)break;next=alias.to;}return next;};
  const matched=batch.flatMap(region=>{const page=meta.query.pages.find((p:any)=>accessKey(p.title)===accessKey(resolve(region)));return page?.revisions?.[0]?.revid?[{region,page}]:[];});
  const changed=matched.filter(({region,page})=>guides[accessKey(region)]?.revision!==page.revisions[0].revid||guides[accessKey(region)]?.page!==page.title);
  const ids=[...new Set(changed.map(({page})=>page.pageid))];
  if(!ids.length)continue;
  const content=await request({action:'query',pageids:ids.join('|'),prop:'revisions',rvprop:'ids|content',rvslots:'main'});
  const staged:AccessGuides={};
  for(const {region,page} of changed){
   const full=content.query?.pages?.find((p:any)=>p.pageid===page.pageid),revision=full?.revisions?.[0],raw=revision?.slots?.main?.content;
   if(typeof raw!=='string')throw new Error('Missing area source');
   staged[accessKey(region)]=extractAreaAccess(region,full.title,revision.revid,raw,new Date().toISOString());
  }
  guides={...guides,...staged};
 }
}
export async function withPurchaseAreas(rods:Rod[],request:WikiRequest):Promise<Rod[]>{
 const regions=[...new Set(rods.filter(rod=>!rod.secondary&&purchasePath(rod)).map(rod=>rod.region).filter(safeAccessPage))];
 for(const rod of rods){const craft=!rod.secondary&&craftingPath(rod);if(craft&&!regions.includes(craft.accessPage))regions.push(craft.accessPage);}
 try{
  await updateGuides(regions,request);
  const equipment=[...new Set(regions.flatMap(region=>guides[accessKey(region)]?.equipment??[]))].slice(0,25);
  await updateGuides(equipment,request);
 }catch{/* Keep each area's last successful source and timestamp; rod refresh can still succeed. */}
 return rods.map(rod=>attachCraftingAccess(attachPurchaseAccess(rod,guides),guides));
}
