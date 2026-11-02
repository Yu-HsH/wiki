// Inert HTML5 AST only. parse/serialize are injected (same pinned parse5 in Deno/tests).
export const SEARCH_DOCUMENT_POLICY='search-html-v1';
const allowed=new Set('div span section p h2 h3 h4 ul ol li b strong i em small blockquote code pre br sup sub table thead tbody tfoot tr th td caption dl dt dd figure figcaption img'.split(' '));
const blocked=new Set('style script iframe object embed form audio video math'.split(' '));
const blockedClasses=new Set(['reflist','mw-editsection','toc']);
const attr=(n,k)=>(n.attrs||[]).find(a=>a.name===k)?.value||'';
const children=n=>n.childNodes||[];
const text=n=>n.nodeName==='#text'?n.value:children(n).map(text).join('');
const escape=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const norm=v=>{try{v=decodeURIComponent(v)}catch{}return String(v).split('#',1)[0].replaceAll('_',' ').replace(/\s+/g,' ').trim()};
const key=v=>norm(v).toLocaleLowerCase('ko-KR');
function find(n,predicate){if(predicate(n))return n;for(const c of children(n)){const hit=find(c,predicate);if(hit)return hit;}return null;}
export function buildSearchDocument(rawHtml,{currentTitle,links},parser){
  if(typeof rawHtml!=='string'||new TextEncoder().encode(rawHtml).length>8000000)throw Error('SEARCH_DOCUMENT_UNAVAILABLE');
  const doc=parser.parse(rawHtml),root=find(doc,n=>attr(n,'class').split(/\s+/).includes('mw-parser-output'))||find(doc,n=>n.tagName==='body');
  const prune=n=>{n.childNodes=children(n).filter(c=>!blocked.has(c.tagName)&&!attr(c,'class').split(/\s+/).some(k=>blockedClasses.has(k))&&!(c.tagName==='sup'&&attr(c,'class').split(/\s+/).includes('reference')));children(n).forEach(prune)};if(root)prune(root);
  const titles=new Map((links||[]).map(l=>[key(l.title||l.targetTitle),norm(l.title||l.targetTitle)]));
  const render=n=>{
    if(n.nodeName==='#text')return escape(n.value);
    if(!n.tagName)return '';
    const tag=n.tagName,classes=attr(n,'class').split(/\s+/);
    if(blocked.has(tag)||classes.some(c=>blockedClasses.has(c))||(tag==='sup'&&classes.includes('reference')))return '';
    const content=()=>children(n).map(render).join('');
    if(tag==='img'){
      let src;try{src=new URL(attr(n,'src'),'https://ko.wikipedia.org');if(src.protocol!=='https:'||src.hostname!=='upload.wikimedia.org')return '';}catch{return '';}
      const dims=['width','height'].filter(k=>/^\d{1,5}$/.test(attr(n,k))).map(k=>` ${k}="${attr(n,k)}"`).join('');
      return `<img src="${escape(src.href)}" alt="${escape(attr(n,'alt'))}" loading="lazy" decoding="async"${dims}>`;
    }
    if(tag==='a'){
      const href=attr(n,'href');let title=null;
      if(!classes.includes('new')&&href.startsWith('/wiki/')&&!href.includes('?')){try{const candidate=norm(decodeURIComponent(href.slice(6).split('#',1)[0]));if(key(candidate)!==key(currentTitle))title=titles.get(key(candidate));}catch{}}
      if(!title)return content();
      return `<a href="#" data-wiki-title="${escape(title)}" class="wiki-inline-link">${text(n).trim()?content():escape(title)}</a>`;
    }
    if(!allowed.has(tag))return content();
    const body=content();if(['p','li','h2','h3','h4'].includes(tag)&&!text(n).trim()&&!text(parser.parse(body)).trim())return '';
    const dims=['td','th'].includes(tag)?['colspan','rowspan'].filter(k=>/^\d{1,2}$/.test(attr(n,k))).map(k=>` ${k}="${attr(n,k)}"`).join(''):'';
    return tag==='br'?'<br>':`<${tag}${dims}>${body}</${tag}>`;
  };
  const html=children(root||{}).map(render).join('');
  // Canonicalize once more: browser HTML parsing and clear-search normalize() see
  // these exact text-node boundaries, including unwrapped elements and entities.
  const canonical=parser.parse(html),body=find(canonical,n=>n.tagName==='body');
  const documentHtml=text(body||{}).trim()?parser.serialize(body):'<p>문서 내용을 불러오지 못했습니다.</p>';
  const finalBody=find(parser.parse(documentHtml),n=>n.tagName==='body');const textNodes=[];
  const visit=n=>{if(n.nodeName==='#text')textNodes.push(n.value);else children(n).forEach(visit)};visit(finalBody);
  return {documentHtml,textNodes,policyVersion:SEARCH_DOCUMENT_POLICY};
}
export function countSearchMatches(textNodes,query){
  const clean=typeof query==='string'?query.trim():'';if(!clean)return 0;
  const expression=new RegExp(clean.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi');
  return textNodes.reduce((count,value)=>count+[...value.matchAll(expression)].length,0);
}
