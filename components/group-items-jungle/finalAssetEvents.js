import { itemName } from './s5UiContract.js';

export const FINAL_ASSET_ROOT=(import.meta.env?.BASE_URL ?? '/')+'group-items-final-s5/';
const iconNames=Object.freeze({
  ink:'ink_blind',censor:'link_censor',trap:'surprise_box',lost_link:'lost_way',bookmark:'path_bookmark',
  undo:'rollback',search:'document_find',link_index:'links_only',parry:'reverse_link_parry',
  shield:'edit_protection',correction:'emergency_correction',thunder:'thunder_judgment',thief:'thief_hand',
  roulette:'chaos_roulette',cannon:'dimension_cannon',enhancement:'enhance_scroll',weakening:'weakening_curse',
});

export function finalIconUrl(itemId,tier) {
  if (!Object.hasOwn(iconNames,itemId)) return null;
  const key=iconNames[itemId];
  return FINAL_ASSET_ROOT+(tier==='enhanced' || tier==='weakened'
    ? `icons/precomposed/${key}--${tier}.png` : `icons/256/${key}.png`);
}

const signal=(kind,asset)=>({kind,asset});

export function attackMotion(itemId, phase, direction, label) {
  if (!itemName(itemId)) return null;
  const asset=phase==='launch' ? 'shared/launch' : phase==='fail' ? 'shared/miss' : undefined;
  return {kind:'attack-'+phase,itemId,direction,label:`${itemName(itemId)} · ${label}`,asset};
}

export function weakeningHitSignal() {
  return { ...signal('weakening','weakening_curse/apply'), direction:'incoming',label:'약화저주에 맞았어요' };
}

export function trapInstallerNotice(outcome) {
  return outcome === 'blocked' ? '설치한 상자가 편집보호로 차단됐어요.'
    : outcome === 'triggered' || outcome === 'hit' ? '설치한 상자가 적중했어요.'
    : '설치한 깜짝상자가 작동했어요.';
}

export function finalReceiptSignal(receipt,warningItem) {
  if (!receipt?.receiptId) return null;
  const {operation,code,success}=receipt;
  switch (operation) {
    case 'parry': {
      if (code!=='PARRY_ACCEPTED' || !['reflected','blocked','reflection_blocked'].includes(receipt.outcome)) return null;
      const reflected=receipt.outcome==='reflected';
      return signal(reflected?'parry-reflect':'parry-block',reflected && warningItem==='thunder'
        ? 'thunder_judgment/parry' : `reverse_link_parry/${reflected?'reflect':'block'}`);
    }
    case 'protect': return code==='PROTECTION_ACTIVE' ? signal('shield-activate','edit_protection/activate') : null;
    case 'correction':
      if (code==='CORRECTION_CHANCE_FAILED') return signal('correction-fail','emergency_correction/fail');
      return code==='CORRECTION_APPLIED' && receipt.closedEffectId ? signal('correction','emergency_correction/success') : null;
    case 'trap_install': return code==='TRAP_INSTALLED' && receipt.trapId ? signal('trap-install',null) : null;
    case 'normal_link':
      if (code==='TRAP_STOPPED' || (code==='MOVED' && receipt.trapOutcome==='arrival' && receipt.stunEventSeq))
        return {...signal('trap-hit','surprise_box/hit'),label:'깜짝상자 발동'};
      return code==='MOVED' && receipt.trapOutcome==='blocked'
        ? {...signal('trap-reveal','surprise_box/reveal'),label:'편집보호로 상자 차단'} : null;
    case 'bookmark_install': return code==='BOOKMARK_INSTALLED' ? signal('bookmark-save','path_bookmark/save') : null;
    case 'bookmark_return': return code==='MOVED' && receipt.moveId ? signal('bookmark-return','path_bookmark/return') : null;
    case 'undo': return code==='MOVED' && receipt.moveId ? signal('undo','rollback/use') : null;
    case 'search': return code==='SEARCH_ACTIVE' ? signal('search','document_find/scan') : null;
    case 'search_execute': return ['SEARCH_FOUND','SEARCH_NOT_FOUND'].includes(code) && receipt.search?.startsAt === receipt.authorityReceivedAt
      ? signal('search','document_find/scan') : null;
    case 'link_index': return code==='LINK_INDEX_ACTIVE' ? signal('links','links_only/reveal') : null;
    case 'enhancement': return code==='ENHANCEMENT_ACTIVE' ? signal('enhancement','enhance_scroll/apply') : null;
    case 'weakening': return code==='WEAKENING_APPLIED' ? signal('weakening','weakening_curse/apply') : null;
    case 'thunder': return ['THUNDER_SELF_PENALTY','THUNDER_SELF_STUN'].includes(code)
      ? signal('thunder-self','thunder_judgment/self') : null;
    case 'thief':
      if (code==='THIEF_NO_TRANSFERABLE_GRANT') return signal('thief-empty','thief_hand/empty');
      return code==='THIEF_RESOLVED' && typeof success==='boolean'
        ? {...signal(success?'thief-steal':'thief-empty',success?'thief_hand/steal':'thief_hand/empty'),
          itemId:receipt.transferredItemId,itemTier:receipt.receivedTier,label:success ? undefined : '탈취 실패'} : null;
    case 'roulette':
      if (code!=='ROULETTE_RESOLVED' || typeof success!=='boolean') return null;
      if (!success) return signal('roulette-fail','chaos_roulette/fail');
      return {
        ...((receipt.automaticChild || receipt.automaticChildren?.length)
          ? signal('roulette-boost','chaos_roulette/boost') : signal('roulette-win','chaos_roulette/win')),
        label:receipt.delivery==='held' ? '아이템 획득 · 보상 확인' : receipt.delivery==='offered' ? '보상함에 도착' : '보상 확인',
      };
    case 'cannon': return code==='CANNON_RESOLVED' && typeof success==='boolean' ? signal('cannon-fire','dimension_cannon/fire') : null;
    default: return null;
  }
}

export function finalResultSignal(result,participantId) {
  const target=result.targetParticipantId===participantId;
  const source=result.sourceParticipantId===participantId;
  const hit=target && result.outcome==='hit' || source && result.outcome==='reflected';
  const protectedResult=result.defenseKind==='protection' && (
    target && result.outcome==='blocked' || source && result.outcome==='reflection_blocked');
  if (result.itemId==='thunder') {
    if (hit) return signal('thunder-hit','thunder_judgment/hit');
    if (protectedResult) return signal('thunder-guard','thunder_judgment/guard');
  }
  if (hit && result.itemId==='weakening') return weakeningHitSignal();
  if (hit && result.itemId==='censor') return signal('censor',null);
  if (protectedResult) return signal('shield-block','edit_protection/block');
  if (!source && !target) return null;
  const outcome = {
    hit: source ? '적중' : '피격',
    blocked: '차단',
    parried_blocked: '패링 차단',
    reflected: source ? '반사당함' : '반사 성공',
    reflection_blocked: '반사 공격 차단',
    void_ineligible: '효과 불발',
    no_censor_candidates: '효과 불발',
  }[result.outcome];
  if (outcome && !(result.itemId==='ink' && target && result.outcome==='hit')) {
    const cue=attackMotion(result.itemId,result.outcome==='hit'?'hit':
      ['void_ineligible','no_censor_candidates'].includes(result.outcome)?'fail':'defend',
      source && result.outcome!=='reflected' ? 'outbound' : 'incoming',outcome);
    if (cue && source && result.outcome==='blocked' && result.defenseKind==='protection')
      return {...cue,asset:'edit_protection/block'};
    return cue;
  }
  return null;
}

export function finalMovementSignal(move,self) {
  if (!move?.moveId || !self || move.pageId!==self.currentPageId || move.revisionId!==self.currentRevisionId
    || move.progressVersion!==self.progressVersion) return null;
  if (move.operation==='lost_link') return signal('lost-arrive','lost_way/arrive');
  return move.operation==='cannon' ? signal('cannon-arrive','dimension_cannon/arrive') : null;
}

const layouts=[
  [[.16,.38],[.82,.47],[.45,.77]],
  [[.17,.28],[.49,.53],[.84,.77]],
  [[.56,.27],[.19,.74],[.82,.74]],
];
const clamp=(x,min,max)=>Math.max(min,Math.min(x,max));

export function finalInkPlacement(effectId,width,height) {
  let seed=2166136261;
  for (const letter of effectId) seed=Math.imul(seed ^ letter.codePointAt(0),16777619);
  const anchors=layouts[(seed>>>0)%layouts.length];
  const random=()=>{
    seed^=seed<<13;
    seed^=seed>>>17;
    seed^=seed<<5;
    return (seed>>>0)/4294967296;
  };
  const topSafe=clamp(height*.13,14,89);
  const bottomSafe=clamp(height*.04,6,42);
  const base=clamp(Math.min(width*.46,height*.45),36,328);
  return anchors.map(([x,y])=>{
    const edgeSize=base*(.88+random()*.20);
    const size=Math.min(edgeSize,width*.68,Math.max(1,height-topSafe-bottomSafe));
    const edge=Math.min(Math.round(size*.18)+5,Math.max(0,(width-size)/2));
    const jx=(random()-.5)*.08;
    const jy=(random()-.5)*.065;
    return {
      left:Math.round(clamp((x+jx)*width-size/2,edge,width-size-edge)),
      top:Math.round(clamp((y+jy)*height-size/2,topSafe,Math.max(topSafe,height-size-bottomSafe))),
      width:Math.round(size),
      '--angle':`${Math.round(-27+random()*55)}deg`,
    };
  });
}
