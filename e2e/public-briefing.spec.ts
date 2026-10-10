import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const BASE = process.env.PUBLIC_BRIEFING_URL ?? "http://localhost:3306";
test.skip(!process.env.PUBLIC_BRIEFING_URL, "Enable only against the separate public briefing instance");

test("read-only boundary rejects private routes and server actions", async ({ request }) => {
  const root = await request.get(BASE, { maxRedirects: 0 });
  expect(root.status()).toBe(307);
  expect(new URL(root.headers().location, BASE).pathname).toBe("/briefing");
  for(const route of ["/sams-phone", "/console", "/swarm", "/manage-who-can-act", "/api/demo/reset", "/api/research/events", "/briefing/missing", "/briefing/constructor", "/briefing%2fdemo", "/_next/data/build/sams-phone.json"])
    expect((await request.get(BASE+route,{headers:{"x-middleware-subrequest":"middleware:middleware:middleware:middleware:middleware"}})).status(),route).toBe(404);
  for(const route of ["/", "/briefing", "/briefing/demo", "/briefings/high-level.pptx"])
    expect((await request.post(BASE+route,{headers:{"Next-Action":"attempted-presenter-action"},data:"[]",maxRedirects:0})).status(),route).toBe(405);
  expect((await request.head(BASE+"/briefing")).status()).toBe(200);
});

test("downloads are exactly the committed editable decks", async ({ request }) => {
  for(const deck of ["high-level","detailed"]){
    const response=await request.get(BASE+`/briefings/${deck}.pptx`);expect(response.status()).toBe(200);
    const local=await readFile(`apps/about/public/briefings/${deck}.pptx`);
    expect((await response.body()).equals(local)).toBe(true);
  }
});

for(const width of [1280,320]) test(`briefing pages reflow and keep public navigation at ${width}px`,async({page})=>{
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  await page.setViewportSize({width,height:900});
  for(const route of ["/briefing","/briefing/high-level","/briefing/detailed","/briefing/demo"]){
    expect((await page.goto(BASE+route))?.status()).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
    const links=await page.locator("a[href]").evaluateAll(as=>as.map(a=>a.getAttribute("href")!));
    expect(links.some(h=>/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(h))).toBe(false);
    expect(links.some(h=>/^\/(sams-phone|console|swarm|manage-who-can-act)/.test(h))).toBe(false);
    expect(links.some(h=>h.includes("codex/issue-111"))).toBe(false);
    for(const href of links.filter(h=>h.startsWith("#")))expect(await page.locator(href).count()).toBeGreaterThan(0);
    const image=page.locator("img");if(await image.count())await expect(image).toBeVisible();
    expect(await image.evaluateAll(imgs=>imgs.some(img=>!img.complete||img.naturalWidth===0))).toBe(false);
    const notes=page.locator("details").first();if(await notes.count()){await notes.locator("summary").focus();await page.keyboard.press("Enter");await expect(notes).toHaveAttribute("open","");}
  }
  expect(errors).toEqual([]);
});
