// Local UI service fixtures only. No Supabase, credentials, DB process or product routing.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
process.chdir(root);
const base = "http://127.0.0.1:5182";
const refine = process.argv.includes("--refine");
const outputDirectory = refine ? ".temp/ux-refine-20261106" : ".temp/rewards-ux";
const out = path.join(root, outputDirectory);
fs.mkdirSync(out, { recursive: true });
const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
await new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once("error", reject);
  probe.listen(5182, "127.0.0.1", () => probe.close(resolve));
});

const titleA = { rewardId: "title_daily_steps_1", kind: "title", displayName: "이어지는 발걸음", assetRef: null };
const titleB = { rewardId: "title_duel_victor_1", kind: "title", displayName: "승부사", assetRef: null };
const icon = { rewardId: "icon_default_book", kind: "profile_icon", displayName: "펼친 책", assetRef: "/profile-icons/book.svg" };
const frame = { rewardId: "frame_ready_explorer", kind: "frame", displayName: "준비된 탐험가", assetRef: "frame:special" };
const background = { rewardId: "background_group_together", kind: "background", displayName: "함께하는 탐험", assetRef: null };
const finish = { rewardId: "finish_better_path_1", kind: "finish_effect", displayName: "더 나은 길 I", assetRef: "finish:tier-1" };
// Generic private-reward specimens contain no actual unrevealed IDs/names/conditions.
const pathReward = { rewardId: "fixture-path", kind: "path_color", displayName: "연습 경로 색상", assetRef: "path:purple" };
const collection = [{ rewardId: "fixture-effect", kind: "path_effect", displayName: "연습 수집 효과", assetRef: null }, { rewardId: "fixture-reaction", kind: "spectator_emoji", displayName: "연습 수집 리액션", assetRef: null }];
const owned = [icon, titleA, titleB, frame, background, finish, pathReward, ...collection];
const entry = reward => ({ slot: reward.kind, slotIndex: 1, rewardId: reward.rewardId, reward });
const initialEquipment = [entry(icon), entry(titleA), entry(frame)];
const response = { achievements: [{ achievementId: "daily_participation", category: "daily", name: "이어지는 발걸음", condition: "오늘의 탐험 참여 기록", tierCount: 2, unlockedTier: 1, current: 8, nextThreshold: 30, tiers: [
  { tier: 1, xp: 30, unlocked: true, unlockId: "fixture-unlock", unlockedAt: "2026-11-05T00:00:00Z", rewards: [titleA], seen: false },
  { tier: 2, xp: 60, unlocked: false, rewards: [finish] },
] }], hidden: { discovered: 0, achievements: [] }, unseenCount: 1 };
const reveal = { items: [{ achievementId: "fixture-result", hidden: false, name: "연습 발견 기록", xp: 30, rewards: ["칭호 견본"], rewardRefs: [titleA], unlockIds: ["fixture-result-unlock"] }] };
const state = { equipment: structuredClone(initialEquipment), calls: [], failedWrites: 0, failedReads: 0, failedInventory: 0, failedAlbum: 0, writeGate: null, matchGate: null };
let releaseWrite, releaseMatch;
const waitWrite = () => { state.writeGate = new Promise(resolve => { releaseWrite = resolve; }); };
const waitMatch = () => { state.matchGate = new Promise(resolve => { releaseMatch = resolve; }); };
const counts = method => state.calls.filter(call => call.method === method).length;
const check = name => { report.checks.push(name); console.log("PASS", name); };
const report = { sha, date: refine ? "2026-11-06 KST" : "2026-11-05 KST", uncommitted: true, environment: "Chromium desktop viewports / service fixtures / no DB", checks: [], errors: [], external: [], captures: [] };
const fixture = `
import React, {useState} from "react";
import {createRoot} from "react-dom/client";
import {MemoryRouter} from "react-router-dom";
import Reward, {ProfileRewardEditorPreview, AchievementAlbumPreview, ResultAchievementsPreview} from "/components/AchievementRewardPreview.jsx";
import ProfileCard from "/components/ProfileCard.jsx";
import {applyEquipment, matchExpressionFromEquipment} from "/utils/profileCard.js";
import "/appStyles.js";
${refine ? 'import "/css/wikiRaceSingleResult.css";' : ''}
const owned = ${JSON.stringify(owned)}, response = ${JSON.stringify(response)}, reveal = ${JSON.stringify(reveal)};
const mode = new URLSearchParams(location.search).get("mode") || "preview";
const Editor = mode === "editor" ? (await import("/components/ProfileRewardEditor.jsx")).default : null;
const Album = mode === "album" ? (await import("/pages/AchievementsPage.jsx")).default : null;
const Result = mode === "result" ? (await import("/components/ResultAchievements.jsx")).default : null;
const equipment = mode.startsWith("preview") ? ${JSON.stringify(initialEquipment)} : await fetch("/__rewards-api/card", {method:"POST",body:"{}"}).then(r=>r.json());
const baseCard = {userId:"fixture-user-a",nickname:"보상 탐험가",level:4};
function AnchoredPreview() {
  const reward = {rewardId:"practice:title:fixture",kind:"title",displayName:"연습용 탐험 칭호",assetRef:null};
  const [card,setCard] = useState({nickname:"연습 카드",title:null});
  const onPreviewAction = action => {
    window.fixturePreviewActions=[...(window.fixturePreviewActions||[]),action];
    if(action.type==="equip" && action.slot==="title" && action.rewardId===reward.rewardId) setCard(old=>({...old,title:reward}));
    if(action.type==="unequip" && action.slot==="title") setCard(old=>({...old,title:null}));
  };
  return <><div data-tutorial-anchor="growth.card"><ProfileCard card={card} density="full"/></div>
    <ProfileRewardEditorPreview card={card} owned={[reward]} matchExpression={{}} goals={[]}
      previewAnchors={{titleControls:"growth.title-controls"}} initialOpenSlot="title" onPreviewAction={onPreviewAction}/></>;
}
function Fixture() {
  const [card,setCard] = useState(applyEquipment(baseCard,equipment));
  window.fixtureSwitchAccount = () => setCard({...baseCard,userId:"fixture-user-b",nickname:"다른 탐험가"});
  const onEquipment = value => { window.fixtureConfirmations=(window.fixtureConfirmations||0)+1; setCard(old=>applyEquipment(old,value)); };
  const onPreviewAction = action => {window.fixturePreviewActions=[...(window.fixturePreviewActions||[]),action];};
  return <MemoryRouter><main style={{maxWidth:1120,margin:"auto",padding:16}} className={${refine ? '"wr-page wr65-field "+' : ''}(mode==="album"?"wr-achievements":"wr-profile")}>
    <h1>B 보상 UI · 로컬 fixture</h1>
    {mode==="editor" && <><div id="profile-card-preview" style={{marginBottom:20}}><ProfileCard card={card} size="xl" density="full"/></div><Editor card={card} owned={owned} onEquipment={onEquipment} previewAnchors={{titleControls:"production-must-ignore"}} initialOpenSlot="title"/></>}
    {mode==="preview-anchor" && <AnchoredPreview/>}
    {mode==="album" && <Album/>}
    {mode==="result" && <section className="wr-result wr-result--single"><Result reveal={reveal} presentation="single"/></section>}
    {mode==="preview" && <><ProfileRewardEditorPreview card={card} owned={owned} matchExpression={matchExpressionFromEquipment(equipment)} onPreviewAction={onPreviewAction}/>
      <AchievementAlbumPreview response={response} ownedIds={new Set(owned.map(r=>r.rewardId))}/>
      <section className="wr-result wr-result--single"><ResultAchievementsPreview reveal={reveal} presentation="single"/></section>
      <section aria-label="개별 견본">{owned.map(reward=><Reward key={reward.rewardId} reward={reward} ownedIds={new Set(owned.map(r=>r.rewardId))}/>)}</section>
    </>}
  </main></MemoryRouter>;
}
createRoot(document.getElementById("root")).render(<Fixture/>);
`;
// Preview bootstraps with literal generic/public fixtures and performs no API reads.
fs.writeFileSync(path.join(out, "fixture.jsx"), fixture);
let server, browser;
try {
  server = await createServer({ root, configFile: false, envFile: false, server: { host: "127.0.0.1", port: 5182, strictPort: true }, plugins: [{
    name: "rewards-ux-fixture",
    enforce: "pre",
    resolveId(source) {
      if (source.endsWith("/services/profileRewardService.js")) return "\0rewards-service";
      if (source.endsWith("/services/achievementService.js")) return "\0rewards-achievements";
      if (source.endsWith("/services/audioManager.js")) return "\0rewards-audio";
      if (source.endsWith("/authContext")) return "\0rewards-auth";
      if (source.endsWith("/components/wiki-race/WikiRaceShell")) return "\0rewards-shell";
    },
    load(id) {
      const call = 'async function call(method,params={}) {const r=await fetch("/__rewards-api/"+method,{method:"POST",body:JSON.stringify(params)});const data=await r.json();if(data.error){const e=new Error(data.error);e.code=data.error;throw e;}return data;}';
      if (id === "\0rewards-service") return call + 'export const equipProfileReward=p=>call("equip",p);export const unequipProfileReward=p=>call("unequip",p);export const fetchOwnMatchExpression=userId=>call("match",{userId});export const fetchOwnRewardInventory=()=>call("inventory");';
      if (id === "\0rewards-achievements") return call + 'export const fetchMyAchievements=()=>call("album");export const markAchievementsSeen=p=>call("seen",p);';
      if (id === "\0rewards-audio") return 'export const audioManager={action:()=>()=>{}};';
      if (id === "\0rewards-auth") return 'export const useAuth=()=>({user:{id:"fixture-user-a"},logout:()=>{}});';
      if (id === "\0rewards-shell") return 'import React from "react";export default function Shell({children}){return React.createElement("div",{className:"wr-achievements"},children);}';
    },
    configureServer(vite) {
      vite.middlewares.use(async (req,res,next) => {
        const url = new URL(req.url,base);
        if (url.pathname === "/__rewards-ux") {
          res.setHeader("Content-Type","text/html");
          res.end('<html lang="ko"><meta name="viewport" content="width=device-width, initial-scale=1"/><title>보상 UI fixture</title><div id="root"></div><script type="module" src="/'+outputDirectory+'/fixture.jsx"></script></html>');
          return;
        }
        if (!url.pathname.startsWith("/__rewards-api/")) return next();
        let raw = ""; for await (const chunk of req) raw += chunk;
        const params = JSON.parse(raw || "{}"), method = url.pathname.split("/").at(-1);
        state.calls.push({method,params});
        let data;
        if (method === "card") data = state.equipment;
        if (method === "inventory") data = state.failedInventory-- > 0 ? {error:"READ_FAILED"} : owned;
        if (method === "album") data = state.failedAlbum-- > 0 ? {error:"READ_FAILED"} : response;
        if (method === "seen") data = {marked:1};
        if (method === "match") {
          const snapshot = Object.fromEntries(state.equipment.filter(e=>["finish_effect","path_color"].includes(e.slot)).map(e=>[e.slot,e.reward]));
          if (state.matchGate) await state.matchGate;
          data = state.failedReads-- > 0 ? {error:"READ_FAILED"} : snapshot;
        }
        if (method === "equip" || method === "unequip") {
          if (state.writeGate) await state.writeGate;
          if (state.failedWrites-- > 0) data = {error:"NETWORK_FAILED"};
          else {
            const reward = owned.find(r=>r.rewardId === params.rewardId);
            state.equipment = state.equipment.filter(e=>e.slot !== params.slot);
            if (method === "equip") state.equipment.push(entry(reward));
            data = state.equipment;
          }
        }
        res.setHeader("Content-Type","application/json"); res.end(JSON.stringify(data));
      });
    },
  }] });
  await server.listen();
  browser = await chromium.launch({headless:true});
  const context = await browser.newContext({viewport:{width:390,height:844}});
  await context.route("**/*",route => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") {report.external.push(url.origin+url.pathname); return route.abort();}
    return route.continue();
  });
  const page = await context.newPage();
  page.on("pageerror",error=>report.errors.push(error.message));
  const goto = async mode => { await page.goto(base+"/__rewards-ux?mode="+mode); await expect(page.getByRole("heading",{name:"B 보상 UI · 로컬 fixture"})).toBeVisible(); };
  const snapshot = async name => {const file=name+".png";await page.screenshot({path:path.join(out,file),fullPage:true});report.captures.push(file);};
  const assertFit = async () => {assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1),true,"no horizontal page overflow");};
  for (const width of [390,768,1440]) {
    await page.setViewportSize({width,height:900});
    const before = state.calls.length;
    await goto("preview");
    const storage = await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage}}));
    await page.getByRole("button",{name:"대표 칭호 변경",exact:true}).focus();
    await page.keyboard.press("Enter");
    const choice = page.getByRole("button",{name:/승부사.*연습용 선택/});
    await expect(choice).toBeVisible();
    await choice.focus(); await page.keyboard.press("Space");
    await expect.poll(()=>page.evaluate(()=>window.fixturePreviewActions?.length||0)).toBe(1);
    await expect(page.locator(".preward-row-head .preward-ownership").filter({hasText:/^장착 중$/})).toHaveCount(3);
    await assertFit();
    assert.deepEqual(await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage}})),storage);
    assert.equal(state.calls.length,before,"preview must not call any services");
    assert.equal(await page.locator('[data-reward-preview] a').count(),0);
    await expect(page.getByText("발견 0 / ??")).toBeVisible();
    await expect(page.locator(".album-reward .pcard-title").first()).toHaveText(titleA.displayName);
    await snapshot("preview-"+width);
    check(width+"px preview / keyboard / no service or storage writes / no hidden totals / title specimen");
  }

  for (const width of [320,390,430,768,1440]) {
    await page.setViewportSize({width,height:900});
    const before=state.calls.length;
    await goto("preview-anchor");
    const stored=await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage}}));
    const target=page.locator('[data-tutorial-anchor="growth.title-controls"]');
    await expect(target).toHaveCount(1);
    assert.equal(await target.evaluate(el=>el.tagName),"LI");
    await expect(page.locator('[data-tutorial-anchor="growth.card"]')).toHaveCount(1);
    await expect(page.getByRole("button",{name:"대표 칭호 변경",exact:true})).toHaveAttribute("aria-expanded","true");
    const choice=target.getByRole("button",{name:/연습용 탐험 칭호.*연습용 선택/});
    await choice.focus(); await page.keyboard.press("Enter");
    await expect(page.locator('[data-tutorial-anchor="growth.card"] .pcard-title')).toHaveText("연습용 탐험 칭호");
    await target.getByRole("button",{name:"연습용 해제",exact:true}).focus();
    await page.keyboard.press("Space");
    await expect(page.locator('[data-tutorial-anchor="growth.card"] .pcard-title')).toHaveCount(0);
    assert.deepEqual(await page.evaluate(()=>window.fixturePreviewActions),[
      {type:"equip",slot:"title",rewardId:"practice:title:fixture"},{type:"unequip",slot:"title"}]);
    await target.scrollIntoViewIfNeeded();
    const bounds=await target.boundingBox();
    assert.ok(bounds && bounds.height < 500 && bounds.height <= 900 && bounds.width <= width);
    assert.ok(bounds.y >= 0 && bounds.y+bounds.height <= 901,"entire title target fits viewport");
    await assertFit();
    assert.equal(state.calls.length,before,"anchored preview performs no service calls");
    assert.deepEqual(await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage}})),stored);
    await snapshot("preview-title-anchor-"+width);
    check(width+"px compact title anchor / actual equip+unequip keyboard buttons / local card only / no backend or storage writes");
  }


  if (refine) for (const width of [390,1440]) {
    await page.setViewportSize({width,height:900});
    await goto("editor");
    await expect(page.getByLabel("장착 상태로 찾기",{exact:true})).toBeEnabled();
    const beforeWrites=counts("equip")+counts("unequip");
    const stored=await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage}}));
    await page.getByRole("navigation",{name:"꾸미기 종류"}).getByRole("button",{name:"칭호",exact:true}).click();
    await page.getByLabel("보유 보상 이름으로 찾기",{exact:true}).fill("승부사");
    await expect(page.locator(".preward-choice")).toHaveCount(1);
    await page.getByRole("button",{name:"승부사 장착 전 견본",exact:true}).click();
    await expect(page.getByRole("region",{name:"장착 전 꾸미기 견본"})).toBeFocused();
    await expect(page.locator(".preward-tryon .pcard-title")).toHaveText(titleB.displayName);
    await expect(page.locator("#profile-card-preview .pcard-title")).toHaveText(titleA.displayName);
    await page.getByRole("button",{name:"견본 닫기",exact:true}).click();
    await expect(page.getByRole("button",{name:"승부사 장착 전 견본",exact:true})).toBeFocused();
    await page.getByLabel("장착 상태로 찾기",{exact:true}).selectOption("equipped");
    await expect(page.locator(".preward-choice")).toHaveCount(0);
    await expect(page.getByText("검색·상태 조건에 맞는 보상이 없습니다.",{exact:true})).toBeVisible();
    await expect(page.locator(".preward-row .preward-ownership")).toContainText(["장착 중"]);
    await page.getByRole("button",{name:"찾기 조건 초기화",exact:true}).click();
    await expect(page.getByLabel("보유 보상 이름으로 찾기",{exact:true})).toHaveValue("");
    check(width+"px owned name/type/status search, no-result meaning and reset preserve real equipment");
    for (const [kind,label,reward] of [
      ["profile_icon","아이콘",icon],["title","칭호",titleB],["frame","프레임",frame],
      ["background","카드 배경",background],["finish_effect","완주 효과",finish],["path_color","경로 색상",pathReward]
    ]) {
      await page.getByRole("navigation",{name:"꾸미기 종류"}).getByRole("button",{name:label,exact:true}).click();
      await page.getByRole("button",{name:reward.displayName+" 장착 전 견본",exact:true}).click();
      const specimen=page.getByRole("region",{name:"장착 전 꾸미기 견본"});
      await expect(specimen).toBeVisible();
      if(kind==="profile_icon")await expect(specimen.locator("img")).toHaveAttribute("src",icon.assetRef);
      if(kind==="title")await expect(specimen.locator(".pcard-title")).toHaveText(titleB.displayName);
      if(kind==="frame")await expect(specimen.locator(".pcard--frame-special")).toHaveCount(1);
      if(kind==="background"){await expect(specimen.locator(".pcard--backed")).toHaveCount(1);await expect(specimen).toContainText("전용 배경 아트는 현재 미지원");}
      if(kind==="finish_effect")await expect(specimen.locator(".fx-finish--tier-1")).toHaveCount(1);
      if(kind==="path_color")assert.equal(await specimen.locator(".preward-path-specimen span").first().evaluate(el=>getComputedStyle(el).borderColor),"rgb(110, 86, 201)");
      await assertFit();await snapshot("refine-"+kind+"-"+width);
      await page.getByRole("button",{name:"견본 닫기",exact:true}).click();
      check(width+"px "+kind+" try-on uses supported renderer/token with no equipment request");
    }
    assert.equal(counts("equip")+counts("unequip"),beforeWrites);
    assert.deepEqual(await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage}})),stored);
    await expect(page.locator("#profile-card-preview .pcard-title")).toHaveText(titleA.displayName);
    check(width+"px collection preview actions keep equipment and storage unchanged");
  }

  await goto("preview");
  await page.emulateMedia({reducedMotion:"reduce"});
  assert.equal(await page.locator(".pcard-avatar-ring").first().evaluate(el=>getComputedStyle(el,"::after").animationName),"none");
  await snapshot("preview-reduced-motion");
  check("reduced motion disables frame animation; preview results are static");
  await page.setViewportSize({width:390,height:844});
  await goto("editor");
  await expect(page.locator('[data-tutorial-anchor="production-must-ignore"]')).toHaveCount(0);
  await expect(page.getByRole("button",{name:"대표 칭호 변경",exact:true})).toHaveAttribute("aria-expanded","false");
  await expect(page.getByRole("button",{name:"완주 효과 변경",exact:true})).toBeEnabled();
  await page.getByRole("button",{name:"대표 칭호 변경",exact:true}).click();
  state.failedWrites=1; waitWrite();
  const writesBefore=counts("equip");
  await page.getByRole("button",{name:/승부사.*보유 · 선택하여 장착/}).evaluate(button=>{button.click();button.click();});
  await expect.poll(()=>counts("equip")).toBe(writesBefore+1);
  await expect(page.getByText("요청 중 · 서버 확인 대기",{exact:true})).toBeVisible();
  assert.equal(await page.locator(".preward button:not(:disabled)").count(),0);
  await expect(page.locator("#profile-card-preview .pcard-title")).toHaveText(titleA.displayName);
  await snapshot("editor-pending-390");
  releaseWrite(); state.writeGate=null;
  await expect(page.getByRole("button",{name:"같은 요청 다시 시도"})).toBeVisible();
  await expect(page.locator("#profile-card-preview .pcard-title")).toHaveText(titleA.displayName);
  await expect(page.locator(".auth-error.preward-error")).toBeFocused();
  await snapshot("editor-failure-390");
  await page.getByRole("button",{name:"같은 요청 다시 시도"}).click();
  await expect(page.locator("#profile-card-preview .pcard-title")).toHaveText(titleB.displayName);
  assert.equal(counts("equip"),writesBefore+2);
  assert.equal(await page.evaluate(()=>window.fixtureConfirmations),1);
  await expect(page.locator(".preward-feedback")).toBeFocused();
  check("pending duplicate prevention / no optimistic card / failure retains equipment / exact retry / confirmed full response");
  await page.reload();
  await expect(page.locator("#profile-card-preview .pcard-title")).toHaveText(titleB.displayName);
  check("F5 reload restores confirmed fixture service equipment");
  for (const width of [390,768,1440]) {
    await page.setViewportSize({width,height:900});
    await page.getByRole("button",{name:"프로필 배경 변경",exact:true}).click();
    await expect(page.getByText(/공통 배경 스타일만/).first()).toBeVisible();
    await assertFit(); await snapshot("editor-"+width);
    await page.getByRole("button",{name:"프로필 배경 변경",exact:true}).click();
    check(width+"px connected editor / missing art and collection-only support disclosure");
  }
  await page.getByRole("button",{name:"대표 칭호 변경",exact:true}).click();
  await page.getByRole("button",{name:"해제",exact:true}).click();
  await expect(page.locator("#profile-card-preview .pcard-title")).toHaveCount(0);
  check("unequip follows full fixture response and removes title");
  state.failedReads=1;
  await goto("editor");
  await expect(page.getByRole("button",{name:"장착 상태 다시 확인"})).toBeVisible();
  await expect(page.getByRole("button",{name:"완주 효과 변경",exact:true})).toBeDisabled();
  await page.getByRole("button",{name:"장착 상태 다시 확인"}).click();
  await expect(page.getByRole("button",{name:"완주 효과 변경",exact:true})).toBeEnabled();
  check("match-expression read failure shown as unknown and retry recovers");
  // A pending initial read must not overwrite the complete equipment response.
  waitMatch();
  const matchReadsBefore=counts("match");
  await goto("editor");
  await expect.poll(()=>counts("match")).toBe(matchReadsBefore+1);
  state.equipment.push(entry(finish));
  await expect(page.getByRole("button",{name:"대표 칭호 변경",exact:true})).toBeEnabled();
  await page.getByRole("button",{name:"대표 칭호 변경",exact:true}).click();
  await page.getByRole("button",{name:/승부사.*보유 · 선택하여 장착/}).click();
  await expect(page.locator("#profile-card-preview .pcard-title")).toHaveText(titleB.displayName);
  releaseMatch(); state.matchGate=null;
  await expect(page.getByRole("button",{name:"완주 효과 변경",exact:true})).toBeEnabled();
  await expect(page.locator(".preward-row").filter({has:page.locator(".preward-label").getByText("완주 효과",{exact:true})}).locator(".preward-current")).toContainText(finish.displayName);
  check("late initial empty read cannot overwrite the full confirmed finish-effect state");
  waitWrite();
  await page.getByRole("button",{name:/이어지는 발걸음.*보유 · 선택하여 장착/}).click();
  await expect(page.getByText("요청 중 · 서버 확인 대기",{exact:true})).toBeVisible();
  await page.evaluate(()=>window.fixtureSwitchAccount());
  releaseWrite(); state.writeGate=null;
  await expect(page.locator("#profile-card-preview .pcard-name")).toHaveText("다른 탐험가");
  await expect(page.locator("#profile-card-preview .pcard-title")).toHaveCount(0);
  check("account-switch unmount discards previous user's late mutation response");
  // A previous account's rejected request must not show an alert on the new account.
  await goto("editor");
  await page.getByRole("button",{name:"대표 칭호 변경",exact:true}).click();
  state.failedWrites=1; waitWrite();
  const failedSwitchBefore=counts("equip");
  await page.getByRole("button",{name:/승부사.*보유 · 선택하여 장착/}).click();
  await expect.poll(()=>counts("equip")).toBe(failedSwitchBefore+1);
  await page.evaluate(()=>window.fixtureSwitchAccount());
  releaseWrite(); state.writeGate=null;
  await expect(page.getByRole("button",{name:"완주 효과 변경",exact:true})).toBeEnabled();
  assert.equal(await page.locator(".preward-error").count(),0);
  check("account-switch unmount discards previous user's late failure");

  state.failedAlbum=1; state.failedInventory=1;
  await goto("album");
  await page.getByRole("button",{name:"업적 다시 불러오기"}).click();
  await expect(page.getByRole("button",{name:"보유 목록 다시 확인"})).toBeVisible();
  await page.getByRole("button",{name:"보유 목록 다시 확인"}).click();
  await expect(page.getByRole("button",{name:"보유 목록 다시 확인"})).toHaveCount(0);
  for (const width of [390,768,1440]) {
    await page.setViewportSize({width,height:900});
    if (width===390) await page.getByRole("button",{name:/보상·기록 자세히 보기/}).click();
    await expect(page.getByText("발견 0 / ??")).toBeVisible();
    await assertFit(); await snapshot("album-"+width);
    check(width+"px album / earned + next specimens / inventory + album read retry");
  }
  await page.setViewportSize({width:390,height:844});
  await goto("result");
  await page.locator(".wr-earned-rewards summary").click();
  await expect(page.getByText(/획득 확인 · 보유 목록 별도 확인/)).toBeVisible();
  await snapshot("result-earned-390");
  await goto("result"); // fixture deliberately returns the same unacknowledged reveal to simulate re-entry.
  await expect(page.locator(".ach-reveal-card")).toHaveCount(1);
  check("result acquired status remains separate from inventory; one card on re-entry (fixture, no new grant)");
  assert.deepEqual(report.errors,[]);
  check("page errors zero; external backend requests zero");
} catch (error) {
  report.failure=error.stack; console.error(error); process.exitCode=1;
} finally {
  releaseWrite?.(); releaseMatch?.();
  if (browser) await browser.close();
  if (server) await server.close();
  fs.writeFileSync(path.join(out,"report.json"),JSON.stringify(report,null,2));
  console.log(JSON.stringify({checks:report.checks.length,errors:report.errors,captures:report.captures.length,failure:report.failure},null,2));
}
