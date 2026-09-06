// Authorized read/test turns only; no service mutation or Vault writes.
import fs from 'node:fs';
const base='http://127.0.0.1:3101';const headers={'Content-Type':'application/json',Origin:base};
const results=[];
for(const backend of ['sol','claude']){
 const started=Date.now();try{const r=await fetch(base+'/api/chat',{method:'POST',headers,body:JSON.stringify({backend,messages:[{role:'user',content:'Reply only AXIOM_OK. This is a connectivity test. Do not use tools, send messages, or modify anything.'}]}),signal:AbortSignal.timeout(135000)});const d=await r.json();results.push({backend,status:r.status,hasReply:typeof d.reply==='string'&&d.reply.length>0,marker:typeof d.reply==='string'&&d.reply.includes('AXIOM_OK'),elapsedMs:Date.now()-started});}catch{results.push({backend,error:'Connectivity test failed',elapsedMs:Date.now()-started});}console.log(JSON.stringify(results.at(-1)));
}
try{const r=await fetch(base+'/api/tts',{method:'POST',headers,body:JSON.stringify({text:'Axiom voice output test.'}),signal:AbortSignal.timeout(65000)});const buf=Buffer.from(await r.arrayBuffer());results.push({service:'piper',status:r.status,type:r.headers.get('content-type'),bytes:buf.length,wav:buf.subarray(0,4).toString()==='RIFF'});}catch{results.push({service:'piper',error:'Synthesis test failed'});}
fs.mkdirSync('docs/screenshots/axiom-live',{recursive:true});fs.writeFileSync('docs/screenshots/axiom-live/services.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results.at(-1)));
