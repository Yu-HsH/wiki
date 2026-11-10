import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";

const port=5228,origin=`http://127.0.0.1:${port}`;
const authOrigin="http://127.0.0.1:54329";
const server=await createServer({
  configFile:false,envFile:false,
  define:{
    "import.meta.env.VITE_SUPABASE_URL":JSON.stringify(authOrigin),
    "import.meta.env.VITE_SUPABASE_ANON_KEY":JSON.stringify("fixture-public-key"),
    "import.meta.env.VITE_OAUTH_GOOGLE_ENABLED":JSON.stringify("true"),
    "import.meta.env.VITE_OAUTH_KAKAO_ENABLED":JSON.stringify("true"),
  },
  server:{host:"127.0.0.1",port,strictPort:true}
});
await server.listen();
let browser;
try{
  browser=await chromium.launch({headless:true});
  for(const [width,provider] of [[1280,"google"],[390,"kakao"]]){
    const ctx=await browser.newContext({viewport:{width,height:800},serviceWorkers:"block"});
    let authorized=null;
    await ctx.route("**/*",async route=>{
      const u=new URL(route.request().url());
      if(u.origin===origin)return route.continue();
      if(u.origin===authOrigin&&u.pathname==="/auth/v1/authorize"){
        authorized=u;
        return route.fulfill({status:200,body:"OAuth provider redirect fixture",contentType:"text/html"});
      }
      return route.fulfill({status:200,body:"[]",headers:{"access-control-allow-origin":"*"}});
    });
    const page=await ctx.newPage();
    await page.goto(origin+"/login");
    await expect(page.getByRole("button",{name:"Google로 계속하기"})).toBeVisible();
    await expect(page.getByRole("button",{name:"카카오로 계속하기"})).toBeVisible();
    await expect(page.getByText(/기존 게임 기록이 있다면 먼저/)).toBeVisible();
    const label=provider==="google"?"Google로 계속하기":"카카오로 계속하기";
    await page.getByRole("button",{name:label}).click();
    await expect.poll(()=>authorized?.searchParams.get("provider")).toBe(provider);
    assert.equal(authorized.searchParams.get("redirect_to"),origin+"/oauth/complete");
    assert.equal(authorized.searchParams.get("flow_type"),"pkce");
    console.log("OAUTH_BROWSER_PROVIDER_PASS "+JSON.stringify({
      viewport:width,provider,redirect:authorized.searchParams.get("redirect_to")
    }));
    await ctx.close();
  }
}finally{
  await browser?.close();
  await server.close();
}
