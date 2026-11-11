import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "../../css/wikiRaceTokens.css";
import "../../css/wikiRaceBase.css";
import "../../css/wikiRaceLobby.css";
import "../../css/jungle65Lobby.css";
import "../../css/profileCard.css";
import ProfileCard from "../../components/ProfileCard.jsx";
import { HostTag, MeTag, StatusMark } from "../../components/wiki-race/LobbyParts.jsx";
import { DENSITY, NAME_FALLBACK, buildProfileCard } from "../../utils/profileCard.js";
import { RoomLobbyEmoteBubble, RoomLobbyEmoteControls } from "../../components/RoomLobbyEmotes.jsx";

const users = [
  { userId:"a", nickname:"황성현", host:true, me:true, ready:false },
  { userId:"b", nickname:"바다의탐험가", ready:true },
  { userId:"c", nickname:"긴닉네임의탐험가123", ready:false },
  { userId:"d", nickname:"문서탐험가", ready:true },
  { userId:"e", nickname:"위키레이스최고의탐험가입니다", ready:false },
  { userId:"f", nickname:"키온응원단", ready:true },
];
const seed = (id, userId, emoteId) => ({id,roomId:"demo",userId,emoteId,createdAt:Date.now()});

function DemoPlayer({player, event, variant, slot, onProfile}) {
  const card = buildProfileCard({userId:player.userId,nickname:player.nickname,source:"snapshot"});
  return variant==="duel" ? (
    <li className={`wr-duel-player wr-kion-slot ${player.me?"wr-is-me":""}`}>
      <span className="wr-duel-player-tags">{player.host&&<HostTag/>}{player.me&&<MeTag/>}</span>
      <ProfileCard card={card} size="lg" density={DENSITY.FULL} nameFallback={NAME_FALLBACK.PARTICIPANT}
        interactive onClick={onProfile} className="wr-name-btn wr65-duel-profile pcard--stacked"/>
      <StatusMark tone="teal">입장 완료</StatusMark>
      <RoomLobbyEmoteBubble event={event} position={slot==="a"?"duel-left":"duel-right"}/>
    </li>
  ) : (
    <li className={`wr-roster-row wr-kion-slot ${player.me?"wr-is-me":""} ${player.ready?"is-ready":""}`}>
      <ProfileCard card={card} size="sm" density={DENSITY.FULL} nameFallback={NAME_FALLBACK.PARTICIPANT}
        interactive onClick={onProfile}
        nameSuffix={<>{player.me&&<MeTag/>}{player.host&&<HostTag/>}</>}/>
      <StatusMark tone={player.ready?"teal":"pending"}>{player.ready?"READY":"준비 중"}</StatusMark>
      <RoomLobbyEmoteBubble event={event} position="group"/>
    </li>
  );
}

function Demo({variant,full=false}) {
  const groupUsers = full ? users : users.slice(0,3);
  const demoId = full ? "group-full" : variant;
  const [events,setEvents] = useState(() => variant === "duel"
    ? [seed("duel-a","a","hello"), seed("duel-b","b","ready")]
    : groupUsers.map((person,i) => seed("group-"+person.userId,person.userId,["hello","good","wow","ready","hurry","gg"][i])));
  const [profileClicks,setProfileClicks]=useState(0);
  const [readyClicks,setReadyClicks]=useState(0);
  const [target,setTarget]=useState("");
  const latest = new Map(events.map(e=>[e.userId,e]));
  const state = {enabled:true,connected:true,sending:false,clock:Date.now(),cooldownUntil:0,
    feedback:"",onSend:(emoteId)=>setEvents(prev=>[...prev.filter(e=>e.userId!=="a"),seed(variant+"-new-"+emoteId,"a",emoteId)])
  };
  return (
    <section id={demoId} className={`wr-page wr-lobby fixture-${variant}`}>
      <div className="wr-shell">
        <header className="fixture-header">WIKI RACE · JUNGLE EXPEDITION</header>
        <div className="fixture-head">
          <small>{variant==="duel"?"DUEL CAMP · 탐험가 대결 준비소":"GROUP · EXPEDITION CAMP"}</small>
          <h2>{variant==="duel"?"1:1 대전 준비":"탐험가 집결 캠프"}</h2>
          <small>실제 페이지의 참가자 카드 구조·CSS를 재사용한 격리 화면</small>
        </div>
        <div className={`wr-room wr-room--${variant}`}>
        {variant==="duel" ? (
          <div className="wr-duel-stage">
            <ul className="wr-duel-players">
              <DemoPlayer player={users[0]} event={latest.get("a")} variant="duel" slot="a" onProfile={()=>setProfileClicks(n=>n+1)}/>
              <li className="wr-duel-center"><span className="wr65-duel-vs">VS</span><span className="wr-duel-center-label">같은 목표</span></li>
              <DemoPlayer player={users[1]} event={latest.get("b")} variant="duel" slot="b" onProfile={()=>setProfileClicks(n=>n+1)}/>
            </ul>
            <RoomLobbyEmoteControls state={state} mode="duel"/>
          </div>
        ) : (
          <div className="wr-group-layout">
            <div className="wr-group-main">
              <div className="wr-party">
                <div className="wr-party-head"><strong className="wr-party-count">{groupUsers.length} / 6</strong><span className="wr-party-title"><b>EXPEDITION PARTY · 탐험대</b><small>방장 · 황성현</small></span></div>
                <ul className="wr-roster">
                  {groupUsers.map(u=><DemoPlayer key={u.userId} player={u} event={latest.get(u.userId)} variant="group" onProfile={()=>setProfileClicks(n=>n+1)}/>)}
                  {Array.from({length:6-groupUsers.length},(_,i)=><li key={i} className="wr-roster-row wr-roster-row--empty"><span className="wr-empty-dot"/>빈 자리</li>)}
                </ul>
                <RoomLobbyEmoteControls state={state} mode="group"/>
              </div>
            </div>
            <aside className="wr-group-mine"><h3>내 탐험 후보</h3>
              <label htmlFor={`target-input-${demoId}`}>목표 문서 검색</label>
              <input id={`target-input-${demoId}`} value={target} onChange={e=>setTarget(e.target.value)} placeholder="위키백과 문서 검색"/>
              <button type="button" onClick={()=>setReadyClicks(n=>n+1)}>READY {readyClicks}</button>
            </aside>
          </div>
        )}
        </div>
        <div className="fixture-foot">프로필 클릭 {profileClicks}회</div>
      </div>
    </section>
  );
}
function App(){return <main><Demo variant="duel"/><Demo variant="group"/><Demo variant="group" full/></main>}
createRoot(document.getElementById("root")).render(<App/>);
