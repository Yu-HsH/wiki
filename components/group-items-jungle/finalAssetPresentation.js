import { finalMovementSignal, finalReceiptSignal, finalResultSignal } from './finalAssetEvents.js';

const sceneDuration={ 'trap-reveal':2900,'trap-hit':2900,correction:2200,'correction-fail':2200,
  'roulette-win':2600,'roulette-fail':2600,'roulette-boost':2600 };
const cannonLaunchMs=800;
const liveWindowMs=2500;

export function createFinalAssetPresentation(fallback,getAudio,now=()=>performance.now()) {
  let scene=null, movementId=null, cannonUntil=null, cannonPending=false, connected=false;
  let censors=[];

  function emit(key,signal) {
    if (!signal) return;
    if (signal.kind) scene={ key,kind:signal.kind,itemId:signal.itemId,itemTier:signal.itemTier,label:signal.label,
      until:now()+(sceneDuration[signal.kind]??1800) };
    if (signal.asset) getAudio()?.play(signal.asset);
  }
  function stop() {
    scene=null;
    cannonUntil=null;
    cannonPending=false;
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
    currentScene:()=>scene,
    pending(operation,value) {
      if (operation==='cannon') cannonPending=value;
    },
    recover(state) {
      stop();
      movementId=state.lastForcedMove?.moveId;
      const at=state.presentation.serverObservedAt;
      censors=censorState(state,at);
    },
    playPulse(pulse) {
      // The selected V5 WAV already contains strikes at 0, 180 and 360 ms.
      // The existing pulse clock emits nothing on a restored effect.
      if (pulse.type==='ink_pulse' && pulse.pulseIndex===0) getAudio()?.play('ink_blind/three_splashes');
    },
    receipt(receipt,context) {
      if (connected && context.live && !context.retransmitted) {
        const cue=finalReceiptSignal(receipt,context.warningItem);
        if (cue?.kind==='correction') censors=censors.filter(row=>row.id!==receipt.closedEffectId);
        if (cue?.kind==='cannon-fire') {
          const id=receipt.movement?.moveId;
          if (!id || id!==movementId) {
            if (id) cannonUntil={ id,until:now()+cannonLaunchMs };
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
      const warning=state.warnings?.find(row=>row.itemId==='lost_link' && frame.now<row.dueAt);
      if (warning && frame.events.some(event=>event.type==='attack_warning' && event.childId===warning.childId))
        getAudio()?.play('lost_way/activate');

      const nextCensors=censorState(state,frame.now);
      const expired=censors.find(row=>row.frame===state.self?.progressVersion && row.expiresAt<=frame.now);
      if (expired) emit(expired.id,{kind:'censor-release',asset:'link_censor/release'});
      censors=nextCensors;

      const move=state.lastForcedMove;
      if (move?.moveId && move.moveId!==movementId && !(move.operation==='cannon' && cannonPending)) {
        const cue=finalMovementSignal(move,state.self);
        if (cue && (cannonUntil?.id!==move.moveId || now()>=cannonUntil.until)) {
          movementId=move.moveId;
          cannonUntil=null;
          emit(move.moveId,cue);
        }
      }
      const protection=state.presentation.projection?.protection;
      const shieldActive=Boolean(protection && protection.startsAt<=frame.now && frame.now<protection.expiresAt);
      return { scene:scene && scene.until>now() ? scene : null, thunder:Boolean(stun), lost:Boolean(warning), shieldActive };
    },
  };
}
