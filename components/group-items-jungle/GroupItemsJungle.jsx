import React, { useEffect, useRef, useState } from "react";
import WikiViewer from "./S5WikiViewer.jsx";
import { normalizeTitle } from "../../services/wikiService.js";
import { HudArrow, HudBrand, HudDoc, HudStat, RaceFrame, RaceHud } from "./S5RaceParts.jsx";
import PlaytestItemsHud from "../group-items-playtest/PlaytestItemsHud.jsx";
import ItemImpactEffect from "../group-items-playtest/ItemImpactEffect.jsx";
import { AttackWarningEdge } from "../group-items-playtest/AttackWarning.jsx";
import DefenseFeedback from "../group-items-playtest/DefenseFeedback.jsx";
import { defenseCue } from "../group-items-playtest/attackFeedback.js";
import { createS25InkPresentation } from "../group-items-playtest/s25InkPresentation.js";
import { createGroupItemsSession, hasS4Effects, selectGroupItemRoute, s4CensoredPageIds } from "./authoritySession.js";
import { isProductS4Scope } from "./productContract.js";
import { preloadProductInkArt, ProductInkVfx, ProductItemMotion } from "./ProductItemVfx.jsx";
import { FinalAssetOverlay, FinalItemIcon, preloadFinalInk } from "./FinalAssetVfx.jsx";
import { nextProductInkPulseDelay, productCueDuration } from "./productPresentation.js";
import "../../css/wikiRaceGroupItemsPlaytest.css";
import "./groupItemsJungle.css";
import "./s5HeadScoped.css";
import S5Panels from './S5Panels.jsx';
import { isS5Scope } from './s5UiContract.js';

const isScopeFailure = error => ["AUTH_REQUIRED","TRANSPORT_SCOPE_MISMATCH","RECEIPT_SCOPE_MISMATCH"].includes(error?.message);

function PlayingGroup({ scope, transport, journal, makeRequestId, loadDocument, target, warningWindowMs, refreshMs, onPulse, subscribe, itemPresentation }) {
  const product = isProductS4Scope(scope);
  const s5 = isS5Scope(scope);
  const [view, setView] = useState(null);
  const [document, setDocument] = useState(null);
  const [failure, setFailure] = useState("");
  const [documentFailure, setDocumentFailure] = useState(false);
  const [documentAttempt, setDocumentAttempt] = useState(0);
  const [lastReceipt, setLastReceipt] = useState(null);
  const [liveCue, setLiveCue] = useState(null);
  const [disconnected, setDisconnected] = useState(false);
  const seenReceipts = useRef(new Set());
  const [trapChoices, setTrapChoices] = useState(null);
  const [s5Pending,setS5Pending] = useState(false);
  const active = useRef(null);

  const finalAssets = s5 && itemPresentation?.finalAssets;
  useEffect(() => {
    if (finalAssets) preloadFinalInk();
    else if (product) preloadProductInkArt();
  }, [finalAssets,product]);

  useEffect(() => {
    const session = createGroupItemsSession({ scope, transport, journal, makeRequestId });
    const presentation = createS25InkPresentation();
    let alive = true;
    let refreshing = false;
    let queued = false;
    let queuedRecovery = false;
    let streamConnected = !subscribe;
    let failed = false;
    let shownResult = null;
    let resultCursor = null;
    let pulseTimer = null;
    const entry = { session, refresh, stop };
    active.current = entry;

    function draw() {
      clearTimeout(pulseTimer);
      if (!alive || failed) return;
      const state = session.snapshot();
      if (!state) return;
      const frame = presentation.frame();
      const self = frame.view;
      if (!self) return;
      const nextPulse = product ? nextProductInkPulseDelay(self) : null;
      if (nextPulse !== null) pulseTimer = setTimeout(draw,nextPulse);
      const bookmark = state.bookmark;
      const display = { ...self, serverTransport:hasS4Effects(scope) ? "s4" : "s3", bookmarkRight:bookmark ? {
        rightId:bookmark.rightId, originLabel:bookmark.pageId, canReturn:bookmark.pageId!==state.self.currentPageId,
        unavailableReason:bookmark.pageId===state.self.currentPageId ? "same_document" : null,
      } : null };
      if (resultCursor === null) resultCursor = state.presentation.recipientEventSeq ?? 0n;
      else for (const result of state.presentation.projection.results) {
        if (!/^[0-9]+$/.test(result.eventSeq) || BigInt(result.eventSeq)<=resultCursor) continue;
        resultCursor = BigInt(result.eventSeq);
        if (streamConnected && !self.viewer.readOnly) itemPresentation?.playResult?.(result,scope.participantId,frame.now);
        if (result.targetParticipantId !== scope.participantId) continue;
        const event = { type:"attack_resolved", eventId:"result:"+result.eventSeq, childId:result.childId,
          recipientId:scope.participantId, outcome:result.outcome, at:Date.parse(result.resolvedAt) };
        const cue = itemPresentation ? itemPresentation.result(result,event,display) : defenseCue(event,display);
        if (cue || !product) shownResult = cue;
      }
      if (shownResult && frame.now - shownResult.at > (product ? productCueDuration(shownResult) : 1600)) shownResult = null;
      for (const pulse of frame.pulseEvents) {
        onPulse?.(pulse,display);
        itemPresentation?.playPulse(pulse,display);
      }
      const itemEffects = state.itemEffects ?? [];
      const censoredPages = s4CensoredPageIds(itemEffects,frame.now);
      const activeEffects = itemEffects.filter(effect=>effect.startsAt<=frame.now && frame.now<effect.expiresAt);
      const stun = activeEffects.find(effect=>effect.kind==='stun');
      const sealed = s5 && activeEffects.some(effect=>effect.kind==='thunder_seal');
      const restricted = s5 && (stun || sealed);
      const visible = restricted ? { ...display,
        warnings:display.warnings.map(warning=>({ ...warning,canParry:false })),
        inventory:display.inventory.map(item=>item && item.action!=='correction' ? { ...item,canSelect:false } : item),
        bookmarkRight:display.bookmarkRight ? { ...display.bookmarkRight,canReturn:false } : null,
      } : display;
      const stunned = Boolean(stun);
      setView({ ...frame, view:visible, self:state.self, supply:state.supply, defense:shownResult,
        finalVisual:itemPresentation?.observe?.(state,frame,streamConnected),
        censoredPages, trapArmed:state.trapArmed, stunned, stunSource:stun?.source, sealed, s5:state.s5,
        cues:itemPresentation?.effects(itemEffects,frame.now,{censored:censoredPages.length>0,stunned}) });
    }

    function stop(error) {
      if (!alive) return;
      failed = true;
      itemPresentation?.stop?.();
      clearTimeout(pulseTimer);
      session.close();
      setView(null);
      setDocument(null);
      setLastReceipt(null);
      setTrapChoices(null);
      setFailure(error?.message ?? "SESSION_UNAVAILABLE");
    }
    async function refresh(recovering=false) {
      if (!alive || failed) return;
      if (refreshing) {
        if (product) { queued=true; queuedRecovery ||= recovering; }
        return;
      }
      refreshing = true;
      try {
        const restored = recovering ? await session.recover() : null;
        const state = recovering ? session.snapshot() : await session.refresh();
        if (!alive) return;
        presentation.accept(state.presentation,{ recovering });
        if (recovering && product) {
          itemPresentation?.recover?.(state);
          resultCursor = state.presentation.recipientEventSeq ?? 0n;
          shownResult = null;
          setLiveCue(null);
        }
        setDisconnected(!streamConnected);
        if (restored?.some(Boolean)) {
          const observed = restored.filter(Boolean);
          for (const receipt of observed) seenReceipts.current.add(receipt.receiptId);
          setLastReceipt(observed.at(-1));
        }
        draw();
      } catch (error) {
        if (product && error?.message === "JUNGLE_GATEWAY_UNAVAILABLE" && alive) {
          presentation.suspend();
          itemPresentation?.stop?.();
          setDisconnected(true);
        } else stop(error);
      } finally {
        refreshing = false;
        if (queued) {
          const recover = queuedRecovery;
          queued=false; queuedRecovery=false;
          void refresh(recover);
        }
      }
    }
    void refresh(true);
    const render = setInterval(draw,50);
    const poll = Number.isFinite(refreshMs) && refreshMs>0 ? setInterval(()=>void refresh(),refreshMs) : null;
    const unsubscribe = subscribe?.((recovering,connected)=>{
      streamConnected = connected;
      if (connected) void refresh(recovering);
      else {
        presentation.suspend();
        itemPresentation?.stop?.();
        setDisconnected(true);
      }
    });
    return () => { alive=false; itemPresentation?.stop?.(); session.close(); active.current=null; clearInterval(render); clearInterval(poll); clearTimeout(pulseTimer); unsubscribe?.(); };
  },[scope,transport,journal,makeRequestId,refreshMs,onPulse,subscribe,itemPresentation,product,s5]);

  const pageId = view?.self?.currentPageId;
  const revisionId = view?.self?.currentRevisionId;
  const snapshotId = view?.self?.currentSnapshotId;
  const progressVersion = product ? view?.self?.progressVersion : undefined;
  const article = document && document.pageId === pageId && document.revisionId === revisionId &&
    (!product || (document.snapshotId === snapshotId && document.progressVersion === progressVersion)) ? document : null;
  useEffect(() => {
    setDocumentFailure(false);
    if (!pageId || !revisionId) return;
    const abort = new AbortController();
    Promise.resolve().then(()=>loadDocument({ pageId,revisionId,snapshotId,progressVersion,signal:abort.signal })).then(result=>{
      if (abort.signal.aborted) return;
      if (result?.pageId !== pageId || result.revisionId !== revisionId || !Array.isArray(result.links) ||
          (product && (result.snapshotId !== snapshotId || result.progressVersion !== progressVersion))) throw new Error("STALE_DOCUMENT");
      setDocument(result);
    }).catch(error=>{
      if (abort.signal.aborted) return;
      if (isScopeFailure(error)) active.current?.stop(error);
      else setDocumentFailure(true);
    });
    return () => abort.abort();
  },[pageId,revisionId,snapshotId,progressVersion,loadDocument,product,documentAttempt]);

  useEffect(()=>{
    if (!liveCue) return;
    const timer = setTimeout(()=>setLiveCue(null),productCueDuration(liveCue));
    return ()=>clearTimeout(timer);
  },[liveCue]);

  const search = view?.s5?.search;
  const delayedSearch = search?.expiresAt > view?.now && search.lastResult?.count === null ? search.windowId : null;
  useEffect(() => {
    if (!delayedSearch || disconnected) return undefined;
    const poll = setInterval(()=>void active.current?.refresh(),500);
    return () => clearInterval(poll);
  },[delayedSearch,disconnected]);

  function run(operation, input) {
    const entry = active.current;
    if (!entry || disconnected) return;
    const panelCommand = s5 && ['search_execute','joker_claim','reward_claim','reward_discard'].includes(operation);
    if (s5 && operation!=='correction' && (view?.stunned || (view?.sealed && operation!=='normal_link'))) return;
    if (panelCommand && s5Pending) return;
    if (panelCommand) setS5Pending(true);
    if (operation === "trap_options") setTrapChoices(null);
    const warningItem = operation === "parry" ? entry.session.snapshot()?.warnings?.find(warning=>warning.childId===input.childId)?.itemId : null;
    itemPresentation?.pending?.(operation,true);
    entry.session.dispatch(operation,input).then(receipt=>{
      if (active.current !== entry) return;
      if (receipt) setLastReceipt(receipt);
      if (itemPresentation && receipt && !seenReceipts.current.has(receipt.receiptId)) {
        seenReceipts.current.add(receipt.receiptId);
        const cue = itemPresentation.receipt(receipt,{live:!finalAssets || !entry.session.snapshot()?.terminal,warningItem,retransmitted:entry.session.isRetransmission(receipt)});
        if (cue) setLiveCue(cue);
      }
      if (operation === "trap_install" && receipt) setTrapChoices(null);
      if (operation === "trap_options" && receipt?.code === "TRAP_OPTIONS") {
        setTrapChoices({ input, options:receipt.options });
      }
      void entry.refresh();
    }).catch(error=>{
      if (active.current !== entry) return;
      if (isScopeFailure(error)) entry.stop(error);
      else setFailure(error?.message ?? "REQUEST_FAILED");
    }).finally(()=>{
      itemPresentation?.pending?.(operation,false);
      if (panelCommand && active.current === entry) setS5Pending(false);
    });
    return { ok:true };
  }

  const frame = view?.view;
  const readOnly = disconnected || (frame?.viewer.readOnly ?? true);
  const censoredPages = new Set(view?.censoredPages ?? []);
  const verifiedSearchQuery = search?.expiresAt > view?.now && search.lastResult?.count > 0 && article
    ? search.lastResult.query : null;
  const censoredTitles = (article?.links ?? []).filter(link=>censoredPages.has(link.pageId))
    .map(link=>link.canonicalTitle ?? link.title);
  const onLinkClick = title => {
    const matches = article?.links.filter(row=>normalizeTitle(row.canonicalTitle ?? row.title) === normalizeTitle(title));
    const link = matches?.[0];
    if (matches?.some(row=>row.pageId!==link.pageId)) return;
    if (link && !view?.stunned && !censoredPages.has(link.pageId)) {
      run("normal_link",{ pageId:article.pageId, revisionId:article.revisionId, snapshotId:article.snapshotId, targetPageId:link.pageId });
    }
  };
  return <div className="group-items-jungle">
    <RaceFrame mode="group" label="그룹 아이템 경기">
      <RaceHud><HudBrand mode="아이템 그룹"/><HudDoc label="현재 문서" title={article?.title ?? pageId}/>
        <HudArrow/><HudDoc kind="goal" label="목표 문서" title={target?.title}/><HudStat label="이동" value={frame?.moveCount ?? 0}/></RaceHud>
      <div className="wr-race-body">
        <div className="gip-document" data-product-vfx={product && !finalAssets} data-s5-priority-vfx={finalAssets ? true : undefined}>
          <main className="wr-race-main" aria-label="문서 읽기 영역">
            <WikiViewer target={target} currentTitle={article?.title ?? ""} currentSummary="" currentDocumentHtml={article?.html ?? ""}
              links={article?.links ?? []} isLoading={Boolean(pageId && !article && !documentFailure)}
              censoredTitles={censoredTitles} authorizedSearchQuery={s5 ? verifiedSearchQuery : undefined} onLinkClick={onLinkClick} readOnly={readOnly || !article || view?.stunned} showTargetBrief={false}/>
            {documentFailure && <div>
              <p role="status">현재 문서를 불러오지 못했습니다.</p>
              <button type="button" onClick={()=>setDocumentAttempt(attempt=>attempt+1)}>문서 다시 불러오기</button>
            </div>}
          </main>
          {frame && !readOnly && <>
            <AttackWarningEdge view={frame} events={view.events} running windowMs={warningWindowMs}/>
            {finalAssets ? <FinalAssetOverlay value={view.finalVisual} pulse={view.pulse} frame={view}/> : product ? <ProductInkVfx pulse={view.pulse} frame={view}/> :
              <ItemImpactEffect view={frame} pulse={view.pulse} events={view.events} running/>}
            {product && !finalAssets && <>
              <ProductItemMotion key={view.defense?.key} cue={view.defense}/>
              <ProductItemMotion key={liveCue?.key} cue={liveCue}/>
            </>}
            {view.defense && (itemPresentation?.renderCue?.(view.defense) ??
              <DefenseFeedback cue={view.defense} showMotion={!product}/>)}
          </>}
        </div>
      </div>
      <div className="group-items-jungle-dock" data-s5-sticky-dock={finalAssets ? true : undefined}>
        {frame && !readOnly && <div className="group-items-jungle-supply" role="status">
          {view.supply ? `보급 ${view.supply.lastClosedRound} · ${view.supply.outcome === "granted" ? "받음" : "가방이 가득 차 건너뜀"}` : "보급 기록 없음"}
          {frame.protection.length>0 && <span> · 편집보호 활성</span>}
          {view.trapArmed && <span> · 현재 문서에 깜짝상자 장착됨</span>}
          {view.stunned && <span> · {view.stunSource === 'thunder' ? '천둥에 감전됐어요' :
            view.stunSource === 'cannon' ? '대포 착지로 기절했어요' : '깜짝상자에 걸렸어요'}</span>}
          {view.sealed && <span> · 천둥으로 아이템이 봉인됐어요</span>}
        </div>}
        <PlaytestItemsHud view={frame} numberSlots={s5} visible={Boolean(frame) && !readOnly} enhancedFeedback running warningWindowMs={warningWindowMs}
          renderItemIcon={finalAssets ? item=><FinalItemIcon item={item}/> : undefined}
          onParry={warning=>run("parry",{ childId:warning.childId })} onReturn={rightId=>run("bookmark_return",{ rightId })}
          onUse={input=>run(input.action,input)}/>
        {s5 && frame && !readOnly && <S5Panels state={view.s5} inventory={frame.inventory.filter(Boolean)} now={view.now} slots={frame.inventory.filter(slot=>!slot).length}
          inputsDisabled={s5Pending || view.stunned || view.sealed || !article} movementDisabled={view.stunned || !article}
          onAct={run} onLink={onLinkClick} censoredPages={censoredPages} lastReceipt={lastReceipt}/>}
        {frame && !readOnly && trapChoices && <div role="group" aria-label="깜짝상자 링크 선택">
          {trapChoices.options.map(option=><button key={option.pageId} type="button"
            onClick={()=>run("trap_install",{ ...trapChoices.input, selectionToken:option.selectionToken })}>
            {option.pageId}
          </button>)}
          {trapChoices.options.length===0 && <p role="status">설치할 수 있는 링크가 없어요.</p>}
          <button type="button" onClick={()=>setTrapChoices(null)}>취소</button>
        </div>}
        {lastReceipt && <output className="group-items-jungle-receipt" aria-label="원본 요청 결과">{lastReceipt.code}</output>}
        {!itemPresentation && lastReceipt?.code==="TRAP_INSTALLED" && <p role="status">깜짝상자를 설치했어요.</p>}
        {[...(view?.cues ?? []), ...(liveCue ? [liveCue] : [])].map(cue=><React.Fragment key={cue.key}>
          {itemPresentation.renderCue?.(cue) ?? <p role="status" data-item-cue={cue.kind}>{cue.message}</p>}
        </React.Fragment>)}
        {disconnected && <button type="button" onClick={()=>void active.current?.refresh(true)}>아이템 상태 다시 확인</button>}
        {failure && <p className="group-items-jungle-status" role="status">{failure}</p>}
        {frame?.viewer.readOnly && <p role="status">경기가 종료됐어요.</p>}
      </div>
    </RaceFrame>
  </div>;
}

export default function GroupItemsJungle({ room,supported,scope,ordinary=null,...props }) {
  const route = selectGroupItemRoute(room,supported);
  if (route === "ordinary") return ordinary;
  if (route === "unsupported" || !scope || (!room.sessionId || room.sessionId!==scope.sessionId) ||
      selectGroupItemRoute({mode:"group_items",sessionId:scope.sessionId,protocol:scope.protocol,binding:scope.binding},supported)!=="item-group" ||
      !Number.isFinite(props.warningWindowMs) || props.warningWindowMs<=0) {
    return <p role="status">이 그룹 아이템 경기 버전은 지원되지 않아요.</p>;
  }
  const key = JSON.stringify([scope.actorId,scope.sessionId,scope.participantId,scope.ownerEpoch,scope.protocol,scope.binding]);
  return <PlayingGroup key={key} scope={scope} {...props}/>;
}
