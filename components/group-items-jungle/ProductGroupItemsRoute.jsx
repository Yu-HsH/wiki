import "./s5Next.css";
import './phase2.css';
import {Phase2Countdown} from './Phase2Panels.jsx';
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../authContext.jsx";
import { supabase } from "../../supabaseClient.js";
import { actGroupItemsRoom, itemModeRpc as rpc, makeRequestId, readIdentity } from "../../services/itemModeEntryService.js";
import GroupItemsJungle from "./GroupItemsJungle.jsx";
import { createPlaytestAudio } from "../group-items-playtest/playtestAudio.js";
import { createGroupItemsContainerAdapters } from "./containerAdapters.js";
import { sameGroupItemsScope } from "./authoritySession.js";
import { PRODUCT_PROTOCOL, productBindingMatches, productId, readProductBinding, readProductRoom } from "./productContract.js";
import { createProductItemPresentation } from "./productPresentation.js";
import { createProductInkAudio } from "./productInkAudio.js";
import { createFinalAssetAudio } from "./finalAssetAudio.js";
import { createFinalAssetPresentation } from "./finalAssetPresentation.js";
import { FIXED_PRODUCT_WIKI_BINDING, readFixedProductWikiDocument } from "./productFixedWikiDocument.js";
import { loadProductWikiDocument } from "./productWikiDocument.js";
import S5KionDock, { MODE_FOLLOWUP_ENABLED } from "./S5KionDock.jsx";
import S5SpectatorDocument from "./S5SpectatorDocument.jsx";
import { CopyCodeButton, LobbyHeader, LobbyShell, MeTag, StatusMark } from "../wiki-race/LobbyParts.jsx";
import { HudBrand, HudDoc, RaceFrame, RaceHold, RaceHud } from "../wiki-race/race/RaceParts.jsx";
import { GroupStandings, ResultActions, ResultCard, ResultOutcome, ResultScreen, ResultXpRow } from "../wiki-race/result/ResultParts.jsx";
import "./groupItemsJungle.css";

const productPath = "/multiplayer/group-items";
const fallbackIntervalMs = 750;
const heartbeatIntervalMs = 4500;
const audioSetting = "group-items-product:ink-audio";
const journal = {
  list(key) { return JSON.parse(sessionStorage.getItem("group-items-product:"+key) ?? "[]"); },
  add(key, id) { sessionStorage.setItem("group-items-product:"+key, JSON.stringify([...new Set([...journal.list(key), id])])); },
  remove(key, id) { sessionStorage.setItem("group-items-product:"+key, JSON.stringify(journal.list(key).filter(value=>value!==id))); },
};

function useRoomActions(binding, actorId) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  async function act(operation, roomId, version, payload = {}) {
    if (inFlight.current) return null;
    inFlight.current = true;
    setPending(true);
    setError("");
    try {
      return await actGroupItemsRoom(binding, actorId, operation, roomId, version, payload);
    } catch (failure) {
      setError(failure.message ?? "PRODUCT_ROOM_UNAVAILABLE");
      return null;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }
  return { pending, error, act };
}

function ProductMatch({ roomId, sessionId, participantId, ownerEpoch, actorId, binding, warningWindowMs, target, subscribe, players, matchClock, roomActions }) {
  const { pathname } = useLocation();
  const previewAudio = import.meta.env.VITE_GROUP_ITEMS_INK_PREVIEW === "1";
  const fixedAudio = productBindingMatches(binding,FIXED_PRODUCT_WIKI_BINDING);
  const finalAssets = (import.meta.env.VITE_GROUP_ITEMS_FINAL_ASSETS === "1" ||
    (import.meta.env.VITE_GROUP_ITEMS_FINAL_ASSETS !== "0" &&
      (import.meta.env.MODE === "s4-product-candidate" || import.meta.env.VITE_GROUP_ITEMS_S5_ENTRY === "1"))) &&
    binding.rulesVersion === "ink-s5-test-v1" && binding.catalogVersion === "ink-s5-test-v1" &&
    binding.modePolicyVersion === "wikipedia-s5-test-v1";
  const audioPreference = finalAssets ? "group-items:final-asset-audio" : audioSetting;
  const volumePreference = "group-items:final-asset-volume";
  const [audioEnabled, setAudioEnabled] = useState(()=>sessionStorage.getItem(audioPreference) === "on");
  const [volume, setVolume] = useState(()=>Number(sessionStorage.getItem(volumePreference) ?? 65));
  const audio = useRef(null);
  useEffect(()=>{
    const output = finalAssets ? createFinalAssetAudio(window) :
      fixedAudio && !previewAudio ? createPlaytestAudio(window) : createProductInkAudio(window,{preview:previewAudio});
    audio.current = output;
    if (finalAssets) output.setVolume(Number(sessionStorage.getItem(volumePreference) ?? 65)/100);
    if (sessionStorage.getItem(audioPreference) === "on") output.enable(true);
    return ()=>{ audio.current = null; output.dispose(); };
  },[fixedAudio,previewAudio,finalAssets,audioPreference]);
  const itemPresentation = useMemo(()=>{
    const base = createProductItemPresentation({
      playInk: (pulse,view) => audio.current?.playPulse(pulse,view,{hidden:document.hidden}),
    });
    return finalAssets ? createFinalAssetPresentation(base,()=>audio.current) : base;
  },[finalAssets]);
  const room = useMemo(()=>({ mode:"group_items", protocol:PRODUCT_PROTOCOL, sessionId, binding }),[sessionId,binding]);
  const scope = useMemo(()=>({ ...room, actorId, participantId, ownerEpoch }),[room,actorId,participantId,ownerEpoch]);
  const adapters = useMemo(()=>createGroupItemsContainerAdapters({ scope, readIdentity,
    async invoke({ operation, payload, accessToken, signal }) {
      const bound = { p_room:roomId, p_session:sessionId, p_binding:binding };
      if (operation === "state") return rpc("get_group_items_product_state_v1", bound, accessToken, signal);
      if (operation === "act") return rpc("act_group_items_product_v1", { ...bound,
        p_request:payload.requestId, p_operation:payload.operation, p_payload:payload.payload }, accessToken, signal);
      if (operation === "receipt") return rpc("get_group_items_product_receipt_v1", { ...bound,
        p_request:payload.requestId }, accessToken, signal);
      if (operation !== "document") throw new Error("PRODUCT_OPERATION_UNSUPPORTED");
      const documentSignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
      const document = await rpc("get_group_items_product_document_v1", { ...bound, p_frame:payload }, accessToken, documentSignal);
      if (!sameGroupItemsScope(document?.scope, scope)) throw new Error("TRANSPORT_SCOPE_MISMATCH");
      const body = await loadProductWikiDocument(payload, document.body, (identity, pinnedSignal)=>{
        if (productBindingMatches(binding,FIXED_PRODUCT_WIKI_BINDING)) return readFixedProductWikiDocument(identity,pinnedSignal);
        return {
          pageId:document.body.pageId, revisionId:document.body.revisionId, canonicalTitle:document.body.canonicalTitle,
          snapshotId:document.body.wikiSnapshotId, documentHtml:document.body.documentHtml,
        };
      }, documentSignal);
      return { scope:document.scope, body };
    },
  }),[scope,roomId,sessionId,binding]);
  const audioControls = (fixedAudio || previewAudio || finalAssets) && <div className={finalAssets ? "s5-final-audio" : undefined}><button type="button" aria-pressed={audioEnabled} onClick={()=>{
      const enabled = !audioEnabled;
      audio.current?.enable(enabled);
      sessionStorage.setItem(audioPreference,enabled ? "on" : "off");
      setAudioEnabled(enabled);
    }}>{finalAssets ? "아이템 효과음" : "먹물 효과음"}</button>
    {finalAssets && <label>효과음 볼륨 <input type="range" min="0" max="100" value={volume} onChange={event=>{
      const next = Number(event.target.value);
      audio.current?.setVolume(next/100);
      sessionStorage.setItem(volumePreference,String(next));
      setVolume(next);
    }}/></label>}</div>;
  return <GroupItemsJungle room={room} supported={room} scope={scope} {...adapters} journal={journal} makeRequestId={makeRequestId}
      target={target} warningWindowMs={warningWindowMs} subscribe={subscribe} itemPresentation={itemPresentation}
      players={players} matchClock={matchClock} roomActions={roomActions} gameAudioRoute={pathname} audioControls={audioControls}
      kionDock={<S5KionDock roomId={roomId} actorId={actorId} players={players}/>}/>;
}


function ProductRoom({ roomId, user, logout }) {
  const navigate = useNavigate();
  const actorId = user.id;
  const [room, setRoom] = useState(null);
  const [failure, setFailure] = useState("");
  const [lastSync, setLastSync] = useState("initial");
  const binding = room?.binding ?? null;
  const roomRef = useRef(null), reloadRef = useRef(null), itemListeners = useRef(new Set());
  const liveRef = useRef(false);
  const { pending, error, act } = useRoomActions(binding, actorId);
  const subscribe = useCallback(listener=>{
    itemListeners.current.add(listener);
    listener(true, liveRef.current);
    return ()=>itemListeners.current.delete(listener);
  },[]);

  useEffect(()=>{
    const abort = new AbortController();
    let reading = false, pendingSource = null;
    async function load(source = "manual") {
      if (abort.signal.aborted) return;
      if (reading) { pendingSource = source; return; }
      reading = true;
      try {
        const identity = await readIdentity();
        if (identity.actorId !== actorId) throw new Error("AUTH_REQUIRED");
        const knownBinding = roomRef.current?.binding ?? null;
        const data = await rpc("get_group_items_product_room_v1", { p_room:roomId, p_binding:knownBinding }, identity.accessToken, abort.signal);
        if (!abort.signal.aborted) {
          const confirmedBinding = knownBinding ?? readProductBinding(data?.binding);
          const next = readProductRoom(data, { roomId, actorId, binding:confirmedBinding }, roomRef.current);
          roomRef.current = next;
          setRoom(next);
          setFailure("");
          setLastSync(source);
        }
      } catch (error) {
        if (!abort.signal.aborted) setFailure(error.message ?? "PRODUCT_ROOM_UNAVAILABLE");
      } finally {
        reading = false;
        if (pendingSource) {
          const nextSource = pendingSource;
          pendingSource = null;
          void load(nextSource);
        }
      }
    }
    function invalidate(source, recovering) {
      if (abort.signal.aborted) return;
      void load(source);
      const canRead = liveRef.current || source === "polling";
      for (const listener of itemListeners.current) listener(recovering, canRead);
    }
    const visibility = ()=>{ if (!document.hidden) invalidate("resume", true); };
    reloadRef.current = load;
    void load("initial");
    const channel = supabase.channel("group-items-signals:"+roomId+":"+actorId)
      .on("postgres_changes",{
        event:"*",schema:"ink_product_events",table:"signals_v1",filter:"recipient_id=eq."+actorId,
      },change=>{
        if (change.new?.room_id===roomId && change.new?.recipient_id===actorId) invalidate("websocket",false);
      })
      .subscribe(status=>{
        if (abort.signal.aborted) return;
        liveRef.current = status === "SUBSCRIBED";
        invalidate(liveRef.current ? "subscribed" : "polling", true);
      });
    const fallback = setInterval(()=>{
      if (!liveRef.current && roomRef.current?.phase !== "finished") invalidate("polling", false);
    }, fallbackIntervalMs);
    const heartbeat = setInterval(()=>{
      if (liveRef.current && roomRef.current?.phase !== "finished") invalidate("heartbeat", false);
    }, heartbeatIntervalMs);
    window.addEventListener("online",visibility);
    document.addEventListener("visibilitychange",visibility);
    return ()=>{
      abort.abort();
      clearInterval(fallback);
      clearInterval(heartbeat);
      liveRef.current = false;
      reloadRef.current = null;
      window.removeEventListener("online",visibility);
      document.removeEventListener("visibilitychange",visibility);
      void supabase.removeChannel(channel);
    };
  },[roomId,actorId]);

  async function command(operation, destination = productPath) {
    const result = await act(operation, roomId, room.version);
    if (!result) return false;
    if (operation === "rematch") navigate(productPath+"/"+result.roomId);
    else if (operation === "leave" && room.phase === "waiting") {
      if (destination) navigate(destination);
    }
    else void reloadRef.current?.();
    return true;
  }

  if (failure || !room) return <RaceFrame mode="group" label="그룹 아이템전">
    <RaceHold title={failure ? "아이템 방을 불러오지 못했어요." : "아이템 방을 확인하는 중…"}
      actions={failure && <button type="button" className="wr-race-btn" onClick={()=>void reloadRef.current?.()}>다시 확인</button>} />
  </RaceFrame>;
  const labels = { ready: "준비", start:"경기 시작", leave:room.phase === "waiting" ? "방 나가기" : "경기 포기", rematch:"재경기" };
  const actions = room.actions.map(action => <button key={action} className="wr-race-btn" type="button" disabled={pending} onClick={()=>void command(action)}>{labels[action]}</button>);
  const actionError = error && <p role="alert">요청을 완료하지 못했어요. 방 상태를 다시 확인해 주세요.</p>;
  const matchClock = room.lifecycle && (room.phase2Policy
    ? <Phase2Countdown lifecycle={room.lifecycle} serverObservedAt={room.serverObservedAt}/>
    : <p aria-label="아이템전 경기 기한">최대 20분 · 3위 완주 후 최대 2분 유예{room.lifecycle.grace_ends_at && " · 유예 진행 중"}</p>);
  let content;
  if (room.phase === "playing" && room.role === "player") {
    content = <ProductMatch roomId={roomId} sessionId={room.sessionId}
      participantId={room.participantId} ownerEpoch={room.ownerEpoch} actorId={actorId} binding={binding}
      warningWindowMs={room.warningWindowMs} target={room.target} subscribe={subscribe} players={room.players}
      matchClock={matchClock} roomActions={<>{actions}{actionError}</>}/>;
  } else if (room.phase === "playing") {
    content = <RaceFrame mode="group" label="아이템 그룹 관전">
      <RaceHud><HudBrand mode="그룹 아이템전" sub="관전" /><HudDoc kind="goal" label="목표 문서" title={room.target?.title} />{matchClock}</RaceHud>
      <section className="product-item-camp-panel" aria-labelledby="s5-spectator-title">
        <h1 id="s5-spectator-title">그룹 아이템전 관전</h1>
        <ul className="product-item-roster" aria-label="참가자와 현재 문서">
          {room.players.map(player => <li key={player.participantId}><strong>{player.name}</strong><span>{player.currentTitle || "현재 문서 정보 없음"}</span></li>)}
        </ul>
      </section>
      {MODE_FOLLOWUP_ENABLED && <S5SpectatorDocument room={room} actorId={actorId}
        readIdentity={readIdentity} rpc={rpc} />}
      <div className="group-items-jungle-dock group-items-jungle-dock--spectator">
        <S5KionDock roomId={roomId} actorId={actorId} players={room.players} spectator/>
        {actionError}
      </div>
    </RaceFrame>;
  } else if (room.phase === "finished") {
    const standings = [...room.results].sort((a,b)=>a.rank-b.rank).map(row => ({
      key: row.participantId, rank: row.rank, name: row.name,
      isMe: row.participantId === room.participantId, isWinner: row.rank === 1 && row.status === "finished",
      retired: row.status === "left", status: row.status === "left" ? "기권/시간 초과" : row.status === "finished" ? "완주" : "경기 종료",
    }));
    const selfResult = room.results.find(row => row.participantId === room.participantId);
    content = <ResultScreen mode="group" tone="neutral" titleId="s5-final-result" resultKey={roomId} testId="s5-final-result">
      <ResultCard label="아이템 그룹 결과">
        <ResultOutcome kicker="그룹 아이템전" title="최종 경기 결과" titleId="s5-final-result" />
        {selfResult && <ResultXpRow><strong>{selfResult.xp === null ? "XP 정산 대기" : "+" + selfResult.xp + " XP"}</strong></ResultXpRow>}
        <GroupStandings rows={standings} showMetrics={false} finishedCount={room.results.filter(row => row.status === "finished").length} retiredCount={standings.filter(row => row.retired).length} />
        {actionError}
        <ResultActions><Link className="wr-race-btn" to="/play">플레이로 돌아가기</Link>{actions}</ResultActions>
      </ResultCard>
    </ResultScreen>;
  } else {
    const leaveLobby = room.actions.includes("leave");
    content = <LobbyShell user={user} mode="group"
      onNavigate={leaveLobby ? destination => void command("leave", destination) : undefined}
      onLogout={async () => {
        if (leaveLobby && !(await command("leave", null))) return;
        await logout();
        navigate("/");
      }}>
      <LobbyHeader kicker="ITEM RACE · GROUP" title="그룹 아이템전 대기실">
        {room.roomCode && <CopyCodeButton code={room.roomCode} />}
      </LobbyHeader>
      <section className="product-item-camp-panel" aria-label="참가 인원과 준비 상태">
        <h2>참가자 {room.players.length} / {room.maximumPlayers}명</h2>
        <p>최소 {room.minimumPlayers}명이 참여하고 모두 준비하면 방장이 시작할 수 있어요.</p>
        <ul className="product-item-roster">
          {room.players.map(player => <li key={player.participantId}>
            <strong>{player.name}</strong>{player.participantId === room.participantId && <MeTag />}
            <StatusMark tone={player.ready ? "ready" : "pending"}>{player.ready ? "준비 완료" : "대기 중"}</StatusMark>
          </li>)}
        </ul>
        {MODE_FOLLOWUP_ENABLED && <S5KionDock mode="lobby" roomId={roomId} actorId={actorId}
          players={room.players} label="대기방 키온 감정표현" />}
        <div className="product-item-actions">{actions}</div>{actionError}
      </section>
    </LobbyShell>;
  }
  return <div data-product-group-phase={room.phase} data-product-sync={lastSync}
    data-product-document-source={productBindingMatches(binding,FIXED_PRODUCT_WIKI_BINDING) ? "fixed" : "wikipedia"}>{content}</div>;
}

export default function ProductGroupItemsRoute() {
  const { roomId } = useParams();
  const { user, logout } = useAuth();
  if (!supabase || !productId(user?.id) || (roomId && !productId(roomId))) {
    return <RaceFrame mode="group" label="그룹 아이템전"><RaceHold title="아이템 방을 열 수 없어요." /></RaceFrame>;
  }
  return roomId
    ? <ProductRoom key={user.id + ":" + roomId} roomId={roomId} user={user} logout={logout} />
    : <Navigate replace to="/multiplayer?mode=group&items=1" />;
}
