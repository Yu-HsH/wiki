import React,{useEffect,useState} from 'react';
import {supabase} from '../../supabaseClient.js';
export default function S5HistoryPanel(){
 const [history,setHistory]=useState(null),[failed,setFailed]=useState(false);
 useEffect(()=>{let active=true;
  void supabase.rpc('get_group_items_history_v1',{p_limit:20}).then(({data,error})=>{
   if(active){if(error)setFailed(true);else setHistory(data);}
  });return()=>{active=false;};
 },[]);
 return <section aria-label="아이템전 기록">
  <h2>그룹 아이템전</h2>
  {failed?<p role="status">아이템전 기록을 불러오지 못했어요.</p>:!history?<p role="status">아이템전 기록을 확인하는 중…</p>:<>
   <p>완주 {history.summary.finished}회 · 기권/시간 초과 {history.summary.retired}회 · 누적 +{history.summary.xp} XP</p>
   {history.entries.length===0?<p>아직 아이템전 기록이 없어요.</p>:<ol>{history.entries.map(row=><li key={row.room_id}>
    {row.result_status==='finished'?row.rank+'위':'기권/시간 초과'} · {row.move_count}회 이동 · +{row.xp} XP
   </li>)}</ol>}
  </>}
 </section>;
}
