import { useEffect, useRef, useState } from 'react';
import type { Rod } from '../lib/rods';
import type { QuestRod } from '../lib/quests';
import RodDetails from './RodDetails';
type CachedRod = { rod:Rod; fetchedAt:string; mode:string; stored:number };
const cache = new Map<string,CachedRod>();
export default function QuestRodPopup({page,summary,trigger,close}:{page:string;summary:QuestRod|undefined;trigger:HTMLElement|null;close:()=>void}) {
  const [details,setDetails]=useState<CachedRod>(),[loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    const modal=dialog.current;if(!modal)return;modal.showModal();
    return()=>{modal.close();if(trigger?.isConnected&&trigger.closest('dialog')?.hasAttribute('open'))trigger.focus({preventScroll:true});};
  },[trigger]);
  useEffect(()=>{
    const saved=cache.get(page);if(saved&&Date.now()-saved.stored<30*60*1000){setDetails(saved);setLoading(false);return;}
    const controller=new AbortController(),timeout=window.setTimeout(()=>controller.abort(),60000);let active=true;
    setLoading(true);setError('');
    void (async()=>{
      try{
        const response=await fetch(`/api/rod-details.json?rod=${encodeURIComponent(page)}&schema=2`,{cache:'no-store',signal:controller.signal});
        if(!response.ok)throw new Error('Details unavailable');
        const value=await response.json();
        if(!value.rod||typeof value.rod.page!=='string'||typeof value.rod.name!=='string'||!Array.isArray(value.rod.recommendations)||!Array.isArray(value.rod.abilities)||!Array.isArray(value.rod.mastery)||!Number.isFinite(Date.parse(value.fetchedAt)))throw new Error('Invalid details');
        const next={...value,stored:Date.now()} as CachedRod;cache.set(page,next);if(active)setDetails(next);
      }catch{if(active)setError('Rod details could not be loaded. Retry or open the full source below. Your quest remains open.');}
      finally{window.clearTimeout(timeout);if(active)setLoading(false);}
    })();
    return()=>{active=false;controller.abort();window.clearTimeout(timeout);};
  },[page,retry]);
  const placeholder:Rod={id:0,page,name:summary?.name??page,url:'https://fischipedia.org/wiki/'+encodeURIComponent(page.replace(/ /g,'_')),stage:summary?.stage??'Not listed',region:'',source:'',quest:'',event:'',price:'',level:summary?.level??'',lure:'',luck:'',control:'',resilience:'',maxWeight:summary?.weightLabel??'',durability:'',disturbance:'',huntFocus:'',lineDistance:'',description:'',hint:'',unavailable:summary?.unavailable??false,recommendations:[]};
  const notice=error||(!loading&&details?`${details.mode==='snapshot'?'Saved wiki data. ':''}Rod source checked: ${new Date(details.fetchedAt).toISOString().replace('T',' ').replace(/\.\d{3}Z$/,' UTC')}`:'Loading rod details…');
  return <dialog className="quest-rod-dialog" id="quest-rod-dialog" aria-labelledby="quest-rod-title" ref={dialog} onCancel={event=>{event.preventDefault();event.stopPropagation();close();}} onClick={event=>{if(event.target===event.currentTarget)close();}}><RodDetails rod={details?.rod??placeholder} close={close} context="quest" loading={loading} notice={notice} retry={error?()=>{cache.delete(page);setRetry(value=>value+1);}:undefined}/></dialog>;
}
