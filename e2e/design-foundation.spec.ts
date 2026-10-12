import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const delegate = process.env.DELEGATE_URL ?? "http://localhost:3300";
const hmrc = process.env.HMRC_URL ?? "http://localhost:3302";
const about = process.env.ABOUT_URL ?? "http://localhost:3304";
const observatory = process.env.OBSERVATORY_URL ?? "http://localhost:3303";
const supplied = readFileSync("styles/design.css", "utf8");

async function appearance(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => {
    const properties = ["fontFamily", "fontSize", "lineHeight", "color", "backgroundColor", "padding", "margin", "width", "minHeight", "border", "outline", "boxShadow"];
    return [...document.querySelectorAll("body, h1, main, .width-container, .ol-main, .ol-container, .form-group, .button, .ol-button, input, .footer-links")].map(element => {
      const style = getComputedStyle(element);
      return Object.fromEntries(properties.map(property => [property, style[property as keyof CSSStyleDeclaration]]));
    });
  });
}

for (const width of [1280, 320]) {
  test(`foundation preserves service branding, spacing and focus at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const [url, oneLogin] of [[`${about}/briefing`, false], [`${hmrc}/act-for-someone`, false], [`${delegate}/ops`, false], [observatory, false], [`${delegate}/account/delegates`, true]] as const) {
      // Compare actual delivered CSS with the original on the same markup.
      await page.route("**/design.css*", route => route.fulfill({ contentType: "text/css", body: oneLogin ? "" : supplied }));
      await page.goto(url);
      const before = await appearance(page);
      const focus = page.getByRole("link", { name: "Skip to main content" });
      await focus.press("Tab");
      const beforeFocus = await focus.evaluate(element => { (element as HTMLElement).focus(); const style = getComputedStyle(element); return { outline: style.outline, shadow: style.boxShadow, color: style.color, background: style.backgroundColor }; });
      await page.unroute("**/design.css*");
      await page.reload();
      expect(await appearance(page), url).toEqual(before);
      await focus.press("Tab");
      const afterFocus = await focus.evaluate(element => { (element as HTMLElement).focus(); const style = getComputedStyle(element); return { outline: style.outline, shadow: style.boxShadow, color: style.color, background: style.backgroundColor }; });
      expect(afterFocus, url).toEqual(beforeFocus);
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bathos-space-6").trim()), url).toBe("2rem");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), url).toBeLessThanOrEqual(0);
    }
  });
}
