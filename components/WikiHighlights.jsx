import React, { useEffect, useState } from 'react';
import { fetchWikiHighlights } from '../services/wikiHighlightsService.js';
const source = 'https://ko.wikipedia.org/wiki/위키백과:대문';
function Picture({ image, className = '' }) {
  const [failed, setFailed] = useState(false);
  return image && <figure className={className}>{failed ? <p role="status">이미지를 불러오지 못했습니다. 원본에서 확인해 주세요.</p> : <img src={image.src} alt={image.alt || ''} loading="lazy" onError={() => setFailed(true)} />}<figcaption>{image.artist} · <a href={image.licenseUrl || image.url} target="_blank" rel="noopener noreferrer">{image.license || '이미지 출처·라이선스 확인'}</a>{image.license && <> · <a href={image.url} target="_blank" rel="noopener noreferrer">원본 ↗</a></>}</figcaption></figure>;
}
export default function WikiHighlights() {
  const [data, setData] = useState(null);
  useEffect(() => { let active = true; fetchWikiHighlights().then(value => { if (active) setData(value); }).catch(() => { if (active) setData({}); }); return () => { active = false; }; }, []);
  const missing = data ? '현재 콘텐츠를 가져오지 못했습니다. 출처에서 확인해 주세요.' : '불러오는 중…';
  return <section className="wr-wiki-highlights" aria-labelledby="wr-discovery-title" aria-busy={!data}>
    <header className="wr-discovery-heading"><h2 id="wr-discovery-title">위키백과 탐험 노트</h2><p>다음 탐험의 실마리를 찾아보세요.</p></header>
    <section className="wr-note wr-note-featured"><h3>알찬 글</h3><Picture image={data?.featured?.image} /><h4>{data?.featured?.title?.replace(/^알찬 글:\s*/, '')}</h4><p>{data?.featured?.text || missing}</p><a className="wr-note-action" href={data?.featured?.url || source} target="_blank" rel="noopener noreferrer">원문 보기 ↗</a></section>
    <section className="wr-note wr-note-facts"><h3>알고 계십니까?</h3><div className="wr-memo-stack">{(data?.facts?.items?.length ? data.facts.items : [data?.facts?.text || missing]).map((text,i) => <p className="wr-memo" key={i}>{text}</p>)}</div><a className="wr-note-action" href={data?.facts?.url || source} target="_blank" rel="noopener noreferrer">흥미로운 사실 더 보기 ↗</a></section>
    <section className="wr-note wr-note-history"><h3>오늘의 역사</h3><ol className="wr-history-line">{(data?.history?.items?.length ? data.history.items : [data?.history?.text || missing]).map((text,i) => <li key={i}>{text}</li>)}</ol><a className="wr-note-action" href={data?.history?.url || source} target="_blank" rel="noopener noreferrer">오늘의 역사 더 보기 ↗</a></section>
    <section className="wr-note wr-note-picture"><h3>오늘의 그림</h3><Picture image={data?.image} className="wr-photo" />{data?.image ? <p>{data.image.alt}</p> : <p>{data ? '그림 또는 라이선스를 확인하지 못했습니다.' : missing}</p>}<a className="wr-note-action" href={data?.image?.url || source} target="_blank" rel="noopener noreferrer">자세히 보기 ↗</a></section>
    <small>출처: 한국어 위키백과 · 텍스트 <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a> · 30분 캐시{data?.fetchedAt && ` · 조회 ${new Date(data.fetchedAt).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' })}`}</small>
  </section>;
}
