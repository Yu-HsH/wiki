import { getKstCourseDate } from '../utils/dailyCourse.js';
const MAIN = 'https://ko.wikipedia.org/wiki/위키백과:대문';
let cached = null;
let pending = null;
export function parseWikiHighlights(html, Parser = globalThis.DOMParser) {
  const doc = new Parser().parseFromString(html, 'text/html');
  const section = prefix => {
    const heading = [...doc.querySelectorAll('.main-section a')].find(a => a.textContent.trim().startsWith(prefix));
    if (!heading) return null;
    const header = heading.closest('.good-header') || heading.closest('div');
    const box = header?.nextElementSibling || header?.parentElement;
    const copy = [...(box?.querySelectorAll('p, li') || [])].map(n => n.textContent.trim()).filter(Boolean);
    const url = href => { try { const u = new URL(href, MAIN); return u.protocol === 'https:' && ['ko.wikipedia.org','commons.wikimedia.org','upload.wikimedia.org','thumb.wikimedia.org'].includes(u.hostname) ? u.href : null; } catch { return null; } };
    const img = box?.querySelector('img');
    const imageUrl = img && url(img.getAttribute('src'));
    const imageSource = img && url(img.closest('a')?.getAttribute('href'));
    return { text: copy.slice(0, 2).join(' ').slice(0, 450), items: copy.slice(0, 3), title: heading.textContent.trim(), url: url(heading.getAttribute('href')) || MAIN,
      image: imageUrl && imageSource ? { src: imageUrl, alt: img.alt, url: imageSource } : null };

  };
  return { featured: section('알찬 글'), facts: section('알고 계십니까'), history: section('오늘의 역사'), picture: section('오늘의 그림') };
}
export async function fetchWikiHighlights() {
  const date = getKstCourseDate();
  if (cached?.date === date && Date.now() - cached.fetchedAt < 30 * 60 * 1000) return cached;
  if (pending) return pending;
  pending = (async () => {
    const [main, feed] = await Promise.allSettled([
      fetch('https://ko.wikipedia.org/w/api.php?' + new URLSearchParams({ action: 'parse', format: 'json', redirects: '1', page: '위키백과:대문', prop: 'text', origin: '*' }), { signal: AbortSignal.timeout(10000) }).then(async r => { if (!r.ok) throw Error('대문 조회 실패'); return r.json(); }),
      fetch(`https://ko.wikipedia.org/api/rest_v1/feed/featured/${date.replaceAll('-', '/')}`, { signal: AbortSignal.timeout(10000) }).then(async r => { if (!r.ok) throw Error('그림 조회 실패'); return r.json(); }),
    ]);
    const sections = main.status === 'fulfilled' && main.value.parse?.text?.['*'] ? parseWikiHighlights(main.value.parse.text['*']) : {};
    const image = feed.status === 'fulfilled' ? feed.value.image : null;
    let safeImage = image?.thumbnail?.source?.startsWith('https://upload.wikimedia.org/') && image?.license?.url?.startsWith('https://creativecommons.org/') ? {
      src: image.thumbnail.source, alt: image.description?.text || image.title,
      artist: image.artist?.text || '제작자 정보는 출처 참고', license: image.license.type,
      licenseUrl: image.license.url, url: `https://commons.wikimedia.org/wiki/${encodeURIComponent(image.title)}`,
    } : null;
    // Korean featured feed may omit the picture. Resolve the main-page file's own Commons metadata.
    if (!safeImage && sections.picture?.image) {
      try {
        const file = decodeURIComponent(new URL(sections.picture.image.url).pathname.split('/wiki/')[1]).replace(/^파일:/, 'File:');
        const response = await fetch('https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({ action:'query', format:'json', prop:'imageinfo', iiprop:'url|extmetadata', iiurlwidth:'800', titles:file, origin:'*' }), { signal:AbortSignal.timeout(10000) });
        if (!response.ok) throw Error('이미지 출처 조회 실패');
        const info = Object.values((await response.json()).query?.pages || {})[0]?.imageinfo?.[0];
        const meta = info?.extmetadata;
        const plain = value => new DOMParser().parseFromString(value || '', 'text/html').body.textContent.trim();
        const licenseUrl = meta?.LicenseUrl?.value?.replace('http://creativecommons.org/', 'https://creativecommons.org/');
        const src = info?.thumburl || info?.url;
        if ((src?.startsWith('https://upload.wikimedia.org/') || src?.startsWith('https://thumb.wikimedia.org/')) && licenseUrl?.startsWith('https://creativecommons.org/')) safeImage = { src, alt:plain(meta?.ImageDescription?.value) || file, artist:plain(meta?.Artist?.value) || '제작자 정보는 출처 참고', license:plain(meta?.LicenseShortName?.value), licenseUrl, url:info.descriptionurl };
      } catch { /* Keep partial failure visible; never substitute unrelated art. */ }
    }
    cached = { ...sections, image: safeImage, date, fetchedAt: Date.now(), source: MAIN };
    return cached;
  })().finally(() => { pending = null; });
  return pending;
}

