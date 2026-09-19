'use client';
import {useEffect,useState} from 'react';

export default function TableTools({targetId,filters=[]}:{targetId:string;filters?:string[]}){
 const [query,setQuery]=useState('');
 const [filter,setFilter]=useState('all');
 const [visible,setVisible]=useState(0);
 useEffect(()=>{
  const root=document.getElementById(targetId); if(!root)return;
  const rows=[...root.querySelectorAll<HTMLElement>('[data-row]')];
  let count=0;
  rows.forEach(row=>{
   const text=(row.dataset.search||row.textContent||'').toLowerCase();
   const value=(row.dataset.filter||'').toLowerCase();
   const okSearch=!query.trim()||text.includes(query.trim().toLowerCase());
   const okFilter=filter==='all'||value===filter.toLowerCase();
   const show=okSearch&&okFilter;
   row.hidden=!show; if(show)count++;
  });
  setVisible(count);
 },[query,filter,targetId]);
 return <div className="table-tools">
  <div className="search-box"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search this view…" aria-label="Search this view"/></div>
  {filters.length>0&&<select className="input filter-select" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All statuses</option>{filters.map(x=><option value={x.toLowerCase()} key={x}>{x}</option>)}</select>}
  <span className="results-count">{visible} shown</span>
  {(query||filter!=='all')&&<button className="button secondary" type="button" onClick={()=>{setQuery('');setFilter('all')}}>Clear</button>}
 </div>
}
