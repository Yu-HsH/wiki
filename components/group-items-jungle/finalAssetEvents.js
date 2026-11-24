export const FINAL_ASSET_ROOT='/group-items-final-s5/';
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
        return signal('trap-hit','surprise_box/hit');
      return code==='MOVED' && receipt.trapOutcome==='blocked' ? signal('trap-reveal','surprise_box/reveal') : null;
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
        ? {...signal(success?'thief-steal':'thief-loss',success?'thief_hand/steal':'thief_hand/empty'),
          itemId:receipt.transferredItemId,itemTier:receipt.receivedTier} : null;
    case 'roulette':
      if (code!=='ROULETTE_RESOLVED' || typeof success!=='boolean') return null;
      return success
        ? (receipt.automaticChild || receipt.automaticChildren?.length) ? signal('roulette-boost','chaos_roulette/boost') : signal('roulette-win','chaos_roulette/win')
        : signal('roulette-fail','chaos_roulette/fail');
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
    return protectedResult ? signal('thunder-guard','thunder_judgment/guard') : null;
  }
  if (hit && result.itemId==='weakening') return signal('weakening','weakening_curse/apply');
  if (hit && result.itemId==='censor') return signal('censor',null);
  return protectedResult ? signal('shield-block','edit_protection/block') : null;
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
  const base=clamp(Math.min(width*.40,height*.39),36,292);
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
