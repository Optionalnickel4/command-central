'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import MarkdownView from '@/components/vault/markdown-view';
import { Pane, PanelEmpty } from './primitives';
export default function ProjectWorkspace(){
 const params=useSearchParams();const [names,setNames]=useState<string[]>([]),[query,setQuery]=useState(''),[content,setContent]=useState<string|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const selected=params.get('note')??(names.includes('_index')?'_index':names[0]);
 useEffect(()=>{const c=new AbortController();fetch('/api/vault',{signal:c.signal}).then(async r=>{if(!r.ok)throw Error();return r.json();}).then(d=>{setNames(d.projects??[]);setLoading(false);}).catch(()=>{if(!c.signal.aborted){setError('Project index unavailable.');setLoading(false);}});return()=>c.abort();},[]);
 useEffect(()=>{if(!selected)return;const c=new AbortController();setContent(null);setError('');fetch('/api/vault/'+encodeURIComponent(selected),{signal:c.signal}).then(async r=>{if(!r.ok)throw Error();return r.json();}).then(d=>setContent(d.content)).catch(()=>{if(!c.signal.aborted)setError('Note unavailable.');});return()=>c.abort();},[selected]);
 function navigate(name:string){const url=new URL(window.location.href);url.searchParams.set('note',name);window.history.pushState(null,'',url.pathname+url.search);}
 return <Pane title="Project notes"><div className="ax-project-workspace"><nav aria-label="Project notes"><label>Search projects<input value={query} onChange={e=>setQuery(e.target.value)}/></label>{names.filter(n=>n.toLowerCase().includes(query.toLowerCase())).map(n=><Link key={n} href={'/projects?note='+encodeURIComponent(n)} aria-current={selected===n?'page':undefined}>{n==='_index'?'Project index':n}</Link>)}{loading&&<p>Reading project index…</p>}</nav><article className="ax-note">{error?<p role="status">{error}</p>:content!==null?<MarkdownView source={content} onNavigate={navigate} known={names}/>:<PanelEmpty>{selected?'Reading note…':'No project notes available.'}</PanelEmpty>}</article></div><p className="ax-empty">Read-only browser. Append-only proposals remain in the conversation workspace and require explicit confirmation.</p></Pane>;
}
