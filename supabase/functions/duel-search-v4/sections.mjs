export function readLinkSections(html, parse) {
  const sections = Object.create(null);
  let section = "본문";
  const text = (node) => node.nodeName === "#text" ? node.value : (node.childNodes || []).map(text).join("");
  const visit = (node) => {
    if (["h2", "h3", "h4"].includes(node.tagName)) {
      section = text(node).replace(/\s+/g, " ").trim() || section;
    } else if (node.tagName === "a") {
      const title = node.attrs?.find((attr) => attr.name === "data-wiki-title")?.value;
      if (title && !Object.hasOwn(sections, title)) sections[title] = section;
    }
    for (const child of node.childNodes || []) visit(child);
  };
  visit(parse(html));
  return sections;
}
