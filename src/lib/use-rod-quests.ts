import { useCallback, useEffect, useRef, useState } from 'react';
import type { QuestDataset } from './quests';
import { fetchDataset, pollDataset } from './browser-dataset-cache';

const endpoint='/api/quests.json?schema=4';
export function useRodQuests(){
 const [data,setData]=useState<QuestDataset>(),[active,setActive]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const controller=useRef<AbortController|null>(null);
 const refresh=useCallback(async()=>{
  if(controller.current)return;
  const request=new AbortController();controller.current=request;
  const timeout=window.setTimeout(()=>request.abort(),45000);
  setLoading(true);setError('');
  try{
   const next=await fetchDataset<QuestDataset>(endpoint,{force:false,signal:request.signal,maxAge:30*60*1000},next=>Array.isArray(next.quests)&&next.quests.length>0&&Array.isArray(next.fish)&&Array.isArray(next.rods)&&Array.isArray(next.mutations)&&next.quests.every(q=>!!q&&typeof q.page==='string'&&Array.isArray(q.stages)&&Array.isArray(q.notes)));
   setData(current=>current&&Date.parse(current.fetchedAt)>Date.parse(next.fetchedAt)?current:next);
  }catch{
   if(controller.current!==request)return;
   // Only load the saved guide bundle on failure. Normal navigation shares the
   // existing Quest Helper cache; expanding rods makes no direct wiki requests.
   try{
    const saved=await import('../data/quests-snapshot.json');
    if(controller.current!==request)return;
    setData(current=>current??saved.default.data as QuestDataset);
    setError('Quest refresh unavailable. Showing saved guide requirements.');
   }catch{if(controller.current===request)setError('Quest requirements could not load. Use the linked Quest Helper or source.');}
  }finally{
   window.clearTimeout(timeout);
   if(controller.current===request){controller.current=null;setLoading(false);}
  }
 },[]);
 useEffect(()=>{
  if(!active)return;
  const stop=pollDataset(endpoint,refresh,30*60*1000);
  return()=>{stop();const current=controller.current;controller.current=null;current?.abort();};
 },[active,refresh]);
 const request=useCallback(()=>setActive(true),[]);
 return {data,loading,error,request};
}
