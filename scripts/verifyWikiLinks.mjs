import { fetchPageData } from "../services/wikiService.js";

const DEFAULT_TITLES = [
  "대한민국",
  "일본",
  "세종대왕",
  "세종",
  "남한",
  "서울특별시",
  "사과 (동음이의)",
  "제2차 세계 대전",
  "한반도",
];

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const repeatArgument = process.argv.find((argument) => argument.startsWith("--repeat="));
const repeatCount = Math.max(1, Number(repeatArgument?.split("=")[1] || 3));
const abaArgument = process.argv.find((argument) => argument.startsWith("--aba="));
const abaTitles = abaArgument?.slice("--aba=".length).split("|").map((title) => title.trim());
const titles = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
const requestedTitles = titles.length > 0 ? titles : DEFAULT_TITLES;

const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await nativeFetch(input, {
      ...init,
      headers: {
        ...Object.fromEntries(new Headers(init.headers).entries()),
        "User-Agent": "WikiRaceLinkVerification/1.0 (local development)",
      },
    });
    if (response.ok || ![429, 500, 502, 503, 504].includes(response.status) || attempt === 5) {
      return response;
    }
    const retryAfterSeconds = Number(response.headers.get("retry-after"));
    const delay = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? Math.min(retryAfterSeconds * 1000, 15000)
      : 1500 * attempt;
    await sleep(delay);
  }
  throw new Error("외부 API 재시도 한도를 초과했습니다.");
};

function difference(left, right) {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}

async function takeSnapshot(title) {
  const page = await fetchPageData(title);
  return {
    requestedTitle: title,
    canonicalTitle: page.canonicalTitle,
    revisionId: page.revisionId,
    finalLinkCount: page.links.length,
    quickLinkCount: page.quickLinks.length,
    links: page.links,
    quickLinks: page.quickLinks,
  };
}

for (const title of requestedTitles) {
  const runs = [];
  try {
    for (let index = 0; index < repeatCount; index += 1) {
      const page = await fetchPageData(title);
      runs.push({
        canonicalTitle: page.canonicalTitle,
        revisionId: page.revisionId,
        rawHtmlAnchorCount: page.linkDiagnostics.rawHtmlAnchorCount,
        apiLinkCount: page.linkDiagnostics.apiLinkCount,
        apiPageCounts: page.linkDiagnostics.apiPageCounts,
        finalLinkCount: page.links.length,
        quickLinkCount: page.quickLinks.length,
        links: page.links,
        quickLinks: page.quickLinks,
      });
      await sleep(700);
    }

    const baseline = runs[0];
    const comparisons = runs.slice(1).map((run, index) => ({
      run: index + 2,
      sameRevision: run.revisionId === baseline.revisionId,
      addedLinks: difference(run.links, baseline.links),
      removedLinks: difference(baseline.links, run.links),
      sameQuickLinks: JSON.stringify(run.quickLinks) === JSON.stringify(baseline.quickLinks),
    }));

    console.log(JSON.stringify({
      requestedTitle: title,
      runtimeHasDomParser: typeof DOMParser !== "undefined",
      repeatCount,
      summary: runs.map(({ links, quickLinks, ...run }) => run),
      comparisons,
    }));
  } catch (error) {
    console.log(JSON.stringify({ requestedTitle: title, error: error.message }));
  }
  await sleep(1000);
}

if (abaTitles?.length === 2 && abaTitles.every(Boolean)) {
  try {
    const firstA = await takeSnapshot(abaTitles[0]);
    await sleep(700);
    const middleB = await takeSnapshot(abaTitles[1]);
    await sleep(700);
    const secondA = await takeSnapshot(abaTitles[0]);

    console.log(JSON.stringify({
      sequence: [firstA.requestedTitle, middleB.requestedTitle, secondA.requestedTitle],
      canonicalSequence: [firstA.canonicalTitle, middleB.canonicalTitle, secondA.canonicalTitle],
      sameARevision: firstA.revisionId === secondA.revisionId,
      addedLinksOnReturn: difference(secondA.links, firstA.links),
      removedLinksOnReturn: difference(firstA.links, secondA.links),
      sameAQuickLinks: JSON.stringify(firstA.quickLinks) === JSON.stringify(secondA.quickLinks),
      counts: [firstA.finalLinkCount, middleB.finalLinkCount, secondA.finalLinkCount],
    }));
  } catch (error) {
    console.log(JSON.stringify({ sequence: abaTitles, error: error.message }));
  }
}
