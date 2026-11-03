// Inert HTML5 AST only. parse/serialize are injected (same pinned parse5 in Deno/tests).
export const SEARCH_DOCUMENT_POLICY='search-html-v1';
const allowed=new Set('div span section p h2 h3 h4 ul ol li b strong i em small blockquote code pre br sup sub table thead tbody tfoot tr th td caption dl dt dd figure figcaption img'.split(' '));
const blocked=new Set('style script iframe object embed form audio video math'.split(' '));
const blockedClasses=new Set(['reflist','mw-editsection','toc']);
const attr=(n,k)=>(n.attrs||[]).find(a=>a.name===k)?.value||'';
const children=n=>n.childNodes||[];
const escape=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const norm=v=>{try{v=decodeURIComponent(v)}catch{}return String(v).split('#',1)[0].replaceAll('_',' ').replace(/\s+/g,' ').trim()};
const key=v=>norm(v).toLocaleLowerCase('ko-KR');
function find(n,predicate){if(predicate(n))return n;for(const c of children(n)){const hit=find(c,predicate);if(hit)return hit;}return null;}
export function buildSearchDocument(rawHtml,{currentTitle,links},parser){
  if(typeof rawHtml!=='string'||new TextEncoder().encode(rawHtml).length>8000000)throw Error('SEARCH_DOCUMENT_UNAVAILABLE');
  const doc=parser.parse(rawHtml),root=find(doc,n=>attr(n,'class').split(/\s+/).includes('mw-parser-output'))||find(doc,n=>n.tagName==='body');
  // Compute the old pruned-tree text predicate once, bottom up. Do not join
  // descendants into a new string for every paragraph, list item, and anchor.
  const hasText=new WeakSet();
  const prune=n=>{
    if(n.nodeName==='#text'){if(n.value.trim())hasText.add(n);return hasText.has(n);}
    const kept=[];let nonempty=false;
    for(const c of children(n)){
      const classes=attr(c,'class').split(/\s+/);
      if(blocked.has(c.tagName)||classes.some(k=>blockedClasses.has(k))||(c.tagName==='sup'&&classes.includes('reference')))continue;
      kept.push(c);if(prune(c))nonempty=true;
    }
    n.childNodes=kept;if(nonempty)hasText.add(n);return nonempty;
  };if(root)prune(root);
  const titles=new Map((links||[]).map(l=>[key(l.title||l.targetTitle),norm(l.title||l.targetTitle)]));
  const currentKey=key(currentTitle),destinations=new Map(),chunks=[];
  const render=n=>{
    if(n.nodeName==='#text'){chunks.push(escape(n.value));return hasText.has(n);}
    if(!n.tagName)return false;
    const tag=n.tagName;
    const content=()=>{let nonempty=false;for(const c of children(n))if(render(c))nonempty=true;return nonempty;};
    if(tag==='img'){
      let src;try{src=new URL(attr(n,'src'),'https://ko.wikipedia.org');if(src.protocol!=='https:'||src.hostname!=='upload.wikimedia.org')return false;}catch{return false;}
      const dims=['width','height'].filter(k=>/^\d{1,5}$/.test(attr(n,k))).map(k=>` ${k}="${attr(n,k)}"`).join('');
      chunks.push(`<img src="${escape(src.href)}" alt="${escape(attr(n,'alt'))}" loading="lazy" decoding="async"${dims}>`);return false;
    }
    if(tag==='a'){
      const href=attr(n,'href');let title=null;
      if(!attr(n,'class').split(/\s+/).includes('new')&&href.startsWith('/wiki/')&&!href.includes('?')){
        if(!destinations.has(href)){
          let destination=null;try{const candidate=norm(decodeURIComponent(href.slice(6).split('#',1)[0])),candidateKey=key(candidate);if(candidateKey!==currentKey)destination=titles.get(candidateKey)||null;}catch{}
          destinations.set(href,destination);
        }
        title=destinations.get(href);
      }
      if(!title)return content();
      chunks.push(`<a href="#" data-wiki-title="${escape(title)}" class="wiki-inline-link">`);
      let nonempty;if(hasText.has(n))nonempty=content();else{chunks.push(escape(title));nonempty=!!title.trim();}
      chunks.push('</a>');return nonempty;
    }
    if(!allowed.has(tag))return content();
    const start=chunks.length;
    const dims=['td','th'].includes(tag)?['colspan','rowspan'].filter(k=>/^\d{1,2}$/.test(attr(n,k))).map(k=>` ${k}="${attr(n,k)}"`).join(''):'';
    if(tag==='br'){chunks.push('<br>');return false;}
    chunks.push(`<${tag}${dims}>`);const nonempty=content();
    if(['p','li','h2','h3','h4'].includes(tag)&&!hasText.has(n)&&!nonempty){chunks.length=start;return false;}
    chunks.push(`</${tag}>`);return nonempty;
  };
  for(const n of children(root||{}))render(n);
  const html=chunks.join('');
  // Canonicalize once more: browser HTML parsing and clear-search normalize() see
  // these exact text-node boundaries, including unwrapped elements and entities.
  const canonical=parser.parse(html),body=find(canonical,n=>n.tagName==='body');
  const nonempty=n=>n.nodeName==='#text'?!!n.value.trim():children(n).some(nonempty);
  const documentHtml=nonempty(body||{})?parser.serialize(body):'<p>문서 내용을 불러오지 못했습니다.</p>';
  const finalBody=find(parser.parse(documentHtml),n=>n.tagName==='body');const textNodes=[];
  const visit=n=>{if(n.nodeName==='#text')textNodes.push(n.value);else children(n).forEach(visit)};visit(finalBody);
  return {documentHtml,textNodes,policyVersion:SEARCH_DOCUMENT_POLICY};
}
export function countSearchMatches(textNodes,query){
  const clean=typeof query==='string'?query.trim():'';if(!clean)return 0;
  const expression=new RegExp(clean.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi');
  let count=0;for(const value of textNodes){expression.lastIndex=0;while(expression.exec(value)!==null)count++;}return count;
}
