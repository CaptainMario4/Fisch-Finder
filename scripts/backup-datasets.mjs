import {updateBackup,kinds,encodeBackup,decodeBackup} from './dataset-backups.mjs';
const repository=process.env.GITHUB_REPOSITORY;
if(repository!=='CaptainMario4/Fisch-Finder')throw Error('Unexpected repository');
const path='src/data/last-good-datasets.json',endpoint=`https://api.github.com/repos/${repository}/contents/${path}`;
const headers={Authorization:`Bearer ${process.env.GITHUB_TOKEN}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
const incoming={};
await Promise.all(kinds.map(async kind=>{try{
 const response=await fetch(`https://fisch-finder-moonke1-0c07.wix-site-host.com/api/${kind}.json`,{signal:AbortSignal.timeout(90000),cache:'no-store'});
 if(!response.ok)throw Error(`HTTP ${response.status}`);incoming[kind]=await response.json();
}catch(error){console.warn(`${kind}: retaining saved backup (${error.message})`);}}));
// Read the current file before every CAS attempt: another workflow may have updated it.
for(let attempt=0;attempt<3;attempt++){
 const response=await fetch(endpoint+'?ref=main',{headers});if(!response.ok)throw Error('Cannot read existing backup');
 const file=await response.json();let previous;
 if(file.content)previous=JSON.parse(Buffer.from(file.content,'base64').toString());
 else {const raw=await fetch(file.download_url,{signal:AbortSignal.timeout(15000)});if(!raw.ok)throw Error('Cannot read backup bytes');previous=await raw.json();}
 previous=decodeBackup(previous);
 const next=updateBackup(previous,incoming);
 if(JSON.stringify(next)===JSON.stringify(previous)){console.log('No newer validated datasets; backup unchanged.');break;}
 const body={branch:'main',sha:file.sha,message:'Save validated last-good wiki datasets',content:Buffer.from(JSON.stringify(encodeBackup(next))).toString('base64')};
 const result=await fetch(endpoint,{method:'PUT',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body)});
 if(result.ok){console.log('Saved validated dataset backups to GitHub.');break;}
 if(result.status!==409||attempt===2)throw Error('Backup publication failed: '+result.status);
}
