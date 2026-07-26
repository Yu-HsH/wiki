import assert from "node:assert/strict";
import test from "node:test";

import {
  dedupeTitles,
  extractTitleFromWikiHref,
  normalizeRequestedTitle,
  normalizeTitle,
  selectAllowedLinkTitles,
  selectAllowedLinkTitlesFromHtml,
  selectDeterministicQuickLinks,
} from "../services/wikiLinkPolicy.js";
import {
  SANITIZER_ALLOWED_TAGS,
  SANITIZER_BLOCKED_SELECTORS,
  getSafeWikiImageSource,
} from "../services/wikiService.js";

const API_LINKS = [
  { ns: 0, title: "대한민국" },
  { ns: 0, title: "서울특별시" },
  { ns: 0, title: "일본" },
  { ns: 0, title: "2001: 스페이스 오디세이" },
  { ns: 6, title: "파일:Flag.svg" },
  { ns: 10, title: "틀:둘러보기" },
  { ns: 14, title: "분류:동아시아" },
];

test("동일한 HTML과 API 입력은 항상 동일한 링크 결과를 반환한다", () => {
  const html = '<a href="/wiki/대한민국">한국</a><a href="/wiki/서울특별시">서울</a>';
  const first = selectAllowedLinkTitlesFromHtml(html, API_LINKS, "한반도");
  const second = selectAllowedLinkTitlesFromHtml(html, [...API_LINKS].reverse(), "한반도");
  assert.deepEqual(first, ["대한민국", "서울특별시"]);
  assert.deepEqual(second, first);
});

test("HTML 문서 등장 순서를 유지하면서 HTML과 API의 교집합만 선택한다", () => {
  const hrefs = [
    "/wiki/서울특별시",
    "/wiki/화면에만_있는_문서",
    "/wiki/대한민국",
  ];
  const links = [...API_LINKS, { ns: 0, title: "API에만 있는 문서" }];
  assert.deepEqual(selectAllowedLinkTitles(hrefs, links, "한반도"), ["서울특별시", "대한민국"]);
});

test("중복과 자기 자신 fragment를 제거하고 다른 문서 fragment는 문서 링크로 정규화한다", () => {
  const hrefs = [
    "/wiki/대한민국",
    "/wiki/대한민국#역사",
    "/wiki/서울특별시#역사",
    "/wiki/서울특별시",
  ];
  assert.deepEqual(selectAllowedLinkTitles(hrefs, API_LINKS, "대한민국"), ["서울특별시"]);
});

test("외부·시스템·파일·틀·분류 링크를 제외하고 namespace 0의 콜론 제목은 허용한다", () => {
  const hrefs = [
    "https://example.com",
    "/w/index.php?title=대한민국&action=edit",
    "/wiki/대한민국?oldid=1",
    "/wiki/파일:Flag.svg",
    "/wiki/틀:둘러보기",
    "/wiki/분류:동아시아",
    "/wiki/2001:_스페이스_오디세이",
  ];
  assert.deepEqual(selectAllowedLinkTitles(hrefs, API_LINKS, "한반도"), ["2001: 스페이스 오디세이"]);
});

test("URL encoding·underscore·공백을 일관되게 정규화한다", () => {
  assert.equal(
    extractTitleFromWikiHref("/wiki/%EC%84%9C%EC%9A%B8_%ED%8A%B9%EB%B3%84%EC%8B%9C#%EC%97%AD%EC%82%AC"),
    "서울 특별시"
  );
  assert.equal(normalizeRequestedTitle("  서울__특별시#역사 "), "서울 특별시");
  assert.equal(normalizeTitle("서울_특별시"), "서울 특별시");
  assert.deepEqual(dedupeTitles(["서울_특별시", " 서울 특별시 "]), ["서울 특별시"]);
  assert.equal(extractTitleFromWikiHref("/wiki/%E0%A4%A"), null);
  assert.equal(extractTitleFromWikiHref("/wiki/서울특별시%23역사"), "서울특별시");
  assert.equal(extractTitleFromWikiHref("/wiki/C"), "C");
});

test("정보상자·표·figure·둘러보기·hatnote 부모는 제거 대상이 아니다", () => {
  for (const selector of ["table", "figure", ".infobox", ".navbox", ".thumb", ".hatnote"]) {
    assert.equal(SANITIZER_BLOCKED_SELECTORS.includes(selector), false);
  }
  for (const tag of ["TABLE", "FIGURE", "FIGCAPTION", "IMG", "TR", "TH", "TD"]) {
    assert.equal(SANITIZER_ALLOWED_TAGS.has(tag), true);
  }
  for (const selector of ["script", "style", "iframe", "object", "embed", "form"]) {
    assert.equal(SANITIZER_BLOCKED_SELECTORS.includes(selector), true);
  }
});

test("Wikimedia 이미지만 안전한 HTTPS 주소로 허용한다", () => {
  assert.equal(
    getSafeWikiImageSource("//upload.wikimedia.org/wikipedia/commons/a/a1/Test.png"),
    "https://upload.wikimedia.org/wikipedia/commons/a/a1/Test.png"
  );
  assert.equal(getSafeWikiImageSource("javascript:alert(1)"), null);
  assert.equal(getSafeWikiImageSource("https://example.com/tracker.png"), null);
  assert.equal(getSafeWikiImageSource("data:image/svg+xml,<svg></svg>"), null);
});

test("빠른 링크는 canonical title과 revision 기반으로 결정되며 최대 20개인 부분집합이다", () => {
  const links = Array.from({ length: 35 }, (_, index) => `문서 ${index + 1}`);
  const options = { canonicalTitle: "대한민국", revisionId: 12345, maxCount: 20 };
  const first = selectDeterministicQuickLinks(links, options);
  const second = selectDeterministicQuickLinks(links, options);
  assert.deepEqual(second, first);
  assert.equal(first.length, 20);
  assert.equal(first.every((title) => links.includes(title)), true);
});

test("A → B → A에서 같은 revision의 A 링크와 빠른 링크가 유지된다", () => {
  const aHtml = '<a href="/wiki/대한민국">한국</a><a href="/wiki/서울특별시">서울</a>';
  const aFirst = selectAllowedLinkTitlesFromHtml(aHtml, API_LINKS, "한반도");
  selectAllowedLinkTitlesFromHtml('<a href="/wiki/일본">일본</a>', API_LINKS, "동아시아");
  const aSecond = selectAllowedLinkTitlesFromHtml(aHtml, API_LINKS, "한반도");
  assert.deepEqual(aSecond, aFirst);
  assert.deepEqual(
    selectDeterministicQuickLinks(aSecond, { canonicalTitle: "한반도", revisionId: 77 }),
    selectDeterministicQuickLinks(aFirst, { canonicalTitle: "한반도", revisionId: 77 })
  );
});
