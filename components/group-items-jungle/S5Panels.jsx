import React, { useState } from 'react';
import {Phase2Rewards} from './Phase2Panels.jsx';
import './phase2.css';
import { itemName, tierLabel } from './s5UiContract.js';

function SearchForm({ search, disabled, onSearch, missed }) {
  const [query,setQuery] = useState('');
  const result = search.lastResult;
  return <section aria-label="문서 내 검색">
    <form onSubmit={event => { event.preventDefault(); if (query.trim()) onSearch('search_execute',{ windowId:search.windowId,query }); }}>
      <label>문서 내 검색 <input value={query} onChange={event => setQuery(event.target.value)} maxLength={4096}/></label>
      <button type="submit" disabled={disabled || !query.trim() || !search.remainingSuccesses}>찾기</button>
    </form>
    <p>{typeof search.draft==='boolean'?'검색':'성공 검색'} {search.remainingSuccesses}회 남음{search.draft?' · 첫 검색 시 아이템 소모, 15초 시작':''}</p>
    {missed && <p role="status">최근 검색 결과가 없어요.</p>}
    {result && <p role="status">{result.count === null ? '결과 확인 대기 중' : `“${result.query}” ${result.count}개 발견`}</p>}
  </section>;
}

function LinkList({ index, disabled, onLink, censoredPages }) {
  const [filter,setFilter] = useState('');
  const query = filter.trim().toLocaleLowerCase('ko');
  const links = index.entries.filter(link => link.title.toLocaleLowerCase('ko').includes(query));
  const groups=Map.groupBy(links,link=>index.tier==='enhanced' ? link.section : null);
  return <details>
    <summary>링크만 보기 · {index.entries.length}개</summary>
    <label>링크 필터 <input value={filter} onChange={event => setFilter(event.target.value)}/></label>
    {[...groups].map(([section,entries])=><section key={section??'links'}>
    {section && <h3>{section}</h3>}
    <ul>{entries.map(link => {
      const blocked = censoredPages?.has(link.pageId) ?? link.blocked;
      return <li key={link.pageId}><button type="button" disabled={disabled || blocked} onClick={() => onLink(link.title)}>
        {link.title}{blocked ? ' · 검열' : ''}
      </button></li>;
    })}</ul></section>)}
    {links.length === 0 && <p>표시할 링크가 없어요.</p>}
  </details>;
}

export default function S5Panels({ state, now, slots, inventory=[], lastReceipt, inputsDisabled, movementDisabled, onAct, onLink, censoredPages }) {
  if (!state || !Number.isFinite(now)) return null;
  const search = state.search?.expiresAt > now ? state.search : null;
  const linkIndex = state.linkIndex?.expiresAt > now ? state.linkIndex : null;
  const modifiers = state.modifiers.filter(effect => effect.startsAt <= now && (effect.expiresAt===null || now < effect.expiresAt));
  return <aside className="s5-panels" aria-label="S5 시험 아이템 효과">
    <p>S5 시험 규칙</p>
    {(modifiers.length > 0 || state.rouletteSupplyWeakened) && <p aria-label="보유 효과">
      {modifiers.map(effect => `${itemName(effect.kind)} ${effect.remainingCharges}회${effect.pendingCharges ? ` (대기 ${effect.pendingCharges})` : ''}`).join(' · ')}
      {modifiers.length > 0 && state.rouletteSupplyWeakened ? ' · ' : ''}
      {state.rouletteSupplyWeakened ? '다음 실제 보급 약화' : ''}
    </p>}
    {['ENHANCEMENT_CHANCE_FAILED','WEAKENING_CHANCE_FAILED'].includes(lastReceipt?.code) &&
      <p role="status">아이템 사용에 실패했어요.</p>}
    {search && <SearchForm key={search.windowId} search={search} disabled={inputsDisabled} onSearch={onAct}
      missed={lastReceipt?.code === 'SEARCH_NOT_FOUND'}/>}
    {linkIndex && <LinkList key={linkIndex.windowId} index={linkIndex} disabled={movementDisabled} onLink={onLink}
      censoredPages={censoredPages}/>}
    {state.phase2Policy && <Phase2Rewards state={state} now={now} inventory={inventory} disabled={inputsDisabled} onAct={onAct}/>}
    {!state.phase2Policy && state.jokerOffers.length > 0 && <details>
      <summary>받을 수 있는 아이템 · {state.jokerOffers.length}건</summary>
      {slots === 0 && <p>가방이 가득 찼어요. 빈 칸을 만든 뒤 받을 수 있어요.</p>}
      {state.jokerOffers.map(offer => <div key={offer.offerId} role="group" aria-label="아이템 받기">
        {offer.candidates.length > 1 && slots >= offer.candidates.length && <button type="button" disabled={inputsDisabled}
          onClick={() => onAct('joker_claim',{ offerId:offer.offerId,candidateIds:offer.candidates.map(item => item.candidateId) })}>
          모두 받기
        </button>}
        {offer.candidates.map(item => <button key={item.candidateId} type="button" disabled={inputsDisabled || slots === 0}
          onClick={() => onAct('joker_claim',{ offerId:offer.offerId,candidateIds:[item.candidateId] })}>
          {[tierLabel(item.tier),itemName(item.itemId)].filter(Boolean).join(' ')} 받기
        </button>)}
      </div>)}
    </details>}
  </aside>;
}
