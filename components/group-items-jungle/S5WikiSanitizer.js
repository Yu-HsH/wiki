import { sanitizeWikiDocumentHtml as sanitizeHeadDocument } from '../../services/wikiService.js';
import { createAllowedTitleMap, normalizeTitle } from '../../services/wikiLinkPolicy.js';

export function sanitizeWikiDocumentHtml(rawHtml,{currentTitle='',apiLinks=[],approvedAliases=[]}={}) {
  const canonical=createAllowedTitleMap(apiLinks);
  const aliases=new Map();
  for (const {title,canonicalTitle} of approvedAliases) {
    const key=normalizeTitle(title);
    const target=canonical.get(normalizeTitle(canonicalTitle));
    if (!target || canonical.has(key)) continue;
    if (aliases.has(key) && aliases.get(key).canonicalTitle!==target) throw new Error('PRODUCT_ALIAS_CONFLICT');
    aliases.set(key,{title,canonicalTitle:target});
  }
  const html=sanitizeHeadDocument(rawHtml,{
    currentTitle,apiLinks:[...apiLinks,...[...aliases.values()].map(({title})=>({title}))],
  });
  if (!aliases.size) return html;
  const document=new DOMParser().parseFromString(html,'text/html');
  for (const link of document.querySelectorAll('a[data-wiki-title]')) {
    const alias=aliases.get(normalizeTitle(link.dataset.wikiTitle));
    if (alias) link.dataset.wikiTitle=alias.canonicalTitle;
  }
  return document.body.innerHTML;
}
