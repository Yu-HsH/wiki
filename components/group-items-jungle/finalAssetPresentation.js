import { attackMotion, finalMovementSignal, finalReceiptSignal, finalResultSignal } from './finalAssetEvents.js';

const sceneDuration={ 'trap-reveal':2900,'trap-hit':2900,correction:2200,'correction-fail':2200,
  'roulette-win':2900,'roulette-fail':2900,'roulette-boost':2900,
  'attack-launch':1200,'attack-warning':850,'attack-hit':1250,'attack-defend':1250,'attack-fail':1250 };
const consumedFailures=new Set(['UNDO_CHANCE_FAILED','ENHANCEMENT_CHANCE_FAILED','WEAKENING_CHANCE_FAILED']);
const cannonLaunchMs=800;
const liveWindowMs=2500;

export function createFinalAssetPresentation(fallback,getAudio,now=()=>performance.now()) {
  let scenes=[], movementId=null, cannonUntil=null, cannonPending=false, connected=false;
  let cannonImpact=null;
  let censors=[];

  function currentScenes() {
    scenes=scenes.filter(scene=>scene.until>now());
    return scenes;
  }
  function emit(key,signal) {
    if (!signal) return;
    if (signal.kind) {
      currentScenes();
      scenes=[...scenes.filter(scene=>scene.key!==key), {
        key,kind:signal.kind,itemId:signal.itemId,itemTier:signal.itemTier,label:signal.label,direction:signal.direction,
        until:now()+(sceneDuration[signal.kind]??1800),
      }];
    }
    if (signal.asset) getAudio()?.play(signal.asset);
  }
  function stop() {
    scenes=[];
    cannonUntil=null;
    cannonPending=false;
    cannonImpact=null;
    connected=false;
    censors=[];
    getAudio()?.stop();
  }
  function censorState(state,at) {
    return (state.itemEffects??[]).filter(row=>row.kind==='censor' && row.startsAt<=at && at<row.expiresAt)
      .map(row=>({id:row.effectId,frame:state.self?.progressVersion,expiresAt:row.expiresAt}));
  }

  return {
    ...fallback,
    finalAssets:true,
    stop,
    playCue:emit,
    currentScene:()=>currentScenes().at(-1) ?? null,
    currentScenes,
    pending(operation,value) {
      if (operation==='cannon') cannonPending=value;
    },
    recover(state) {
      stop();
      movementId=state.lastForcedMove?.moveId;
      const at=state.presentation.serverObservedAt;
      censors=censorState(state,at);
      cannonImpact=state.itemEffects?.find(row=>row.kind==='stun' && row.source==='cannon')?.effectId;
    },
    playPulse(pulse) {
      // The selected V5 WAV already contains strikes at 0, 180 and 360 ms.
      // The existing pulse clock emits nothing on a restored effect.
      if (pulse.type==='ink_pulse' && pulse.pulseIndex===0) getAudio()?.play('ink_blind/three_splashes');
    },
    receipt(receipt,context) {
      if (connected && context.live && !context.retransmitted) {
        const cue=finalReceiptSignal(receipt,context.warningItem) ??
          (receipt.code==='ATTACK_ACCEPTED' ? attackMotion(context.itemId,'launch','outbound','발사') :
            consumedFailures.has(receipt.code) ? attackMotion(context.itemId,'fail','outbound','효과 불발') : null);
        if (cue?.kind==='correction') censors=censors.filter(row=>row.id!==receipt.closedEffectId);
        if (cue?.kind==='parry-reflect' || cue?.kind==='parry-block') {
          emit(receipt.receiptId,{...cue,direction:'from-self',label:cue.kind==='parry-reflect'?'반사 성공':'패링 차단'});
        } else if (cue?.kind==='cannon-fire') {
          const id=receipt.movement?.moveId;
          if (!id || id!==movementId) {
            cannonUntil={ id,key:receipt.receiptId,returned:receipt.success===false,until:now()+cannonLaunchMs };
            emit(receipt.receiptId,cue);
          }
        } else emit(receipt.receiptId,cue);
      }
      return fallback.receipt(receipt,context);
    },
    playResult(result,participantId,at) {
      const age=at-Date.parse(result.resolvedAt);
      if (age>=-50 && age<liveWindowMs) emit(result.childId,finalResultSignal(result,participantId));
    },
    observe(state,frame,streamConnected) {
      if (!streamConnected || frame.view.viewer.readOnly) {
        stop();
        return null;
      }
      connected=true;
      const stun=state.itemEffects?.find(row=>row.kind==='stun' && row.source==='thunder' &&
        row.startsAt<=frame.now && frame.now<row.expiresAt);
      getAudio()?.stun(stun?.effectId);
      const impact=state.itemEffects?.find(row=>row.kind==='stun' && row.source==='cannon' &&
        row.startsAt<=frame.now && frame.now<row.expiresAt);
      if (impact && impact.effectId!==cannonImpact && frame.now-impact.startsAt<900 &&
          !cannonPending && !(cannonUntil?.id && cannonUntil.id===state.lastForcedMove?.moveId)) {
        emit(impact.effectId,attackMotion('cannon','hit','incoming','착지 충격'));
      }
      cannonImpact=impact?.effectId;
      const warning=state.warnings?.find(row=>row.itemId==='lost_link' && frame.now<row.dueAt);
      for (const event of frame.events) {
        if (event.type!=='attack_warning') continue;
        const pending=state.warnings?.find(row=>row.childId===event.childId && frame.now<row.dueAt);
        if (!pending) continue;
        const cue=attackMotion(pending.itemId,'warning','incoming','공격 접근');
        if (cue) emit(`warning:${pending.childId}`,pending.itemId==='lost_link' ? {...cue,asset:'lost_way/activate'} : cue);
      }

      const nextCensors=censorState(state,frame.now);
      const expired=censors.find(row=>row.frame===state.self?.progressVersion && row.expiresAt<=frame.now);
      if (expired) emit(expired.id,{kind:'censor-release',asset:'link_censor/release'});
      censors=nextCensors;

      const move=state.lastForcedMove;
      if (cannonUntil?.returned && !cannonUntil.id && now()>=cannonUntil.until) {
        emit(`${cannonUntil.key}:return`,{kind:'cannon-return',asset:'shared/miss'});
        cannonUntil=null;
      }
      if (move?.moveId && move.moveId!==movementId && !(move.operation==='cannon' && cannonPending)) {
        const cue=finalMovementSignal(move,state.self);
        if (cue && (cannonUntil?.id!==move.moveId || now()>=cannonUntil.until)) {
          movementId=move.moveId;
          const returned=cannonUntil?.id===move.moveId && cannonUntil.returned;
          cannonUntil=null;
          emit(move.moveId,returned ? {kind:'cannon-return',asset:'shared/miss'} : cue);
        }
      }
      const protection=state.presentation.projection?.protection;
      const shieldActive=Boolean(protection && protection.startsAt<=frame.now && frame.now<protection.expiresAt);
      return { scenes:currentScenes(), thunder:Boolean(stun), lost:Boolean(warning), shieldActive };
    },
  };
}
