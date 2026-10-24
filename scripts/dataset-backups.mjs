import { gzipSync, gunzipSync } from 'node:zlib';
export const kinds = ['fish','rods','companions','quests'];
export function validBackup(kind, data, previous) {
 const now=Date.now(),time=Date.parse(data?.fetchedAt);
 if(!kinds.includes(kind)||!Number.isFinite(time)||time>now+300000||data?.mode!=='api'||!Array.isArray(data[kind])||!data[kind].length)return false;
 const rows=data[kind];
 if(rows.length<Math.max(1,(previous?.[kind]?.length??0)*.7)||new Set(rows.map(x=>x?.page)).size!==rows.length)return false;
 if(!rows.every(x=>x&&typeof x.page==='string'&&typeof x.name==='string'&&x.url?.startsWith(x.secondary?'https://fisch.fandom.com/wiki/':'https://fischipedia.org/wiki/')))return false;
 if(kind==='fish')return rows.every(x=>['bait','time','weather','season','methods','locations','adminEvents','crabCages','radar'].every(k=>Array.isArray(x[k])));
 if(kind==='rods')return rows.every(x=>Array.isArray(x.abilities)&&Array.isArray(x.mastery)&&Array.isArray(x.recommendations)&&(x.secondary||x.obtainment?.version===3&&Array.isArray(x.obtainment.sections)&&Array.isArray(x.obtainment.references)));
 if(kind==='companions')return rows.every(x=>['abilities','buffs','obtainment','gameplayNotes'].every(k=>Array.isArray(x[k])));
 return ['fish','rods','mutations'].every(k=>Array.isArray(data[k])&&data[k].length)&&rows.every(x=>Array.isArray(x.stages)&&Array.isArray(x.notes));
}
export function updateBackup(previous, incoming) {
 const next={...previous};
 for(const kind of kinds){const data=incoming[kind];if(validBackup(kind,data,previous[kind])&&Date.parse(data.fetchedAt)>Date.parse(previous[kind]?.fetchedAt??'1970-01-01'))next[kind]=data;}
 return next;
}

export function encodeBackup(data) { return {schema:1,encoding:'gzip-base64',data:gzipSync(JSON.stringify(data)).toString('base64')}; }
export function decodeBackup(value) {
 if(value?.schema!==1||value?.encoding!=='gzip-base64'||typeof value.data!=='string'||value.data.length>8000000)throw Error('Invalid backup envelope');
 return JSON.parse(gunzipSync(Buffer.from(value.data,'base64'),{maxOutputLength:10000000}).toString());
}
