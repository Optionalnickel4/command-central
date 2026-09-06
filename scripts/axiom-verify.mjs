import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
const out="docs/screenshots/axiom-static";
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:out+"/video",size:{width:1440,height:1000}}});
const page=await context.newPage();
const errors=[],api=[],checks=[],a11y=[],layout=[];
page.on("pageerror",e=>errors.push(e.message));
page.on("request",r=>{if(new URL(r.url()).pathname.startsWith("/api/"))api.push(new URL(r.url()).pathname)});
async function go(path="/"){await page.goto("http://127.0.0.1:3101"+path,{waitUntil:"networkidle"})}
async function scan(name){
 await page.addScriptTag({path:"node_modules/axe-core/axe.min.js"});
 const violations=await page.evaluate(async()=> (await window.axe.run(document,{runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21aa"]}})).violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})));
 a11y.push({name,violations});
}
for(const width of [390,768,1024,1440,1920]){
 await page.setViewportSize({width,height:1000});await go();
 const measured=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,h1:document.querySelectorAll("h1").length,animations:document.getAnimations().length,
 outside:[...document.querySelectorAll(".ax-app *")].filter(e=>{const r=e.getBoundingClientRect();return r.width && (r.right>innerWidth+1||r.left< -1)&&getComputedStyle(e).position!=="fixed"}).slice(0,5).map(e=>e.className)}));
 layout.push(measured); assert.equal(measured.document,width);assert.equal(measured.h1,1);assert.equal(measured.animations,0);assert.deepEqual(measured.outside,[]);
 await page.screenshot({path:out+"/"+width+".png",fullPage:true});
 if(width===390)await page.screenshot({path:out+"/390-viewport.png"});
 await scan("command-"+width);
}
await page.setViewportSize({width:1440,height:1000});await go();
await page.getByRole("button",{name:"Inspect media",exact:true}).click();
await page.getByRole("dialog").waitFor();
assert.equal(await page.locator("#ax-dialog-title").evaluate(e=>document.activeElement===e),true);
assert.match(page.url(),/inspect=media/);
await page.screenshot({path:out+"/inspector.png"});
await scan("inspector");
await page.keyboard.press("Escape");
await page.getByRole("dialog").waitFor({state:"detached"});
assert.equal(await page.getByRole("button",{name:"Inspect media",exact:true}).evaluate(e=>document.activeElement===e),true);
checks.push("Inspector heading focus, Escape close, URL state and trigger focus restoration");
await page.keyboard.press("/");
await page.getByRole("dialog",{name:"Command palette"}).waitFor();
await page.getByLabel("Find a destination").fill("systems");
assert.equal(await page.getByRole("navigation",{name:"Command results"}).getByRole("link").count(),1);
await page.screenshot({path:out+"/command-palette.png"});
await page.getByRole("navigation",{name:"Command results"}).getByRole("link",{name:"Systems"}).click();
await page.waitForURL("**/systems");
await page.getByLabel("Find a system").fill("media");
assert.equal(await page.locator(".ax-inventory>div").count(),1);
await page.keyboard.press("/");
assert.equal(await page.getByRole("dialog").count(),0);
await page.getByLabel("Find a system").fill("");
checks.push("Command palette shortcut, destination filter, normal-link navigation, inventory filter and editable-field shortcut guard");
await go("/?inspect=media");
await page.getByRole("dialog").waitFor();
await page.reload();await page.getByRole("dialog").waitFor();
await page.keyboard.press("Escape");
checks.push("Inspector direct deep link survives refresh");
await go();
await page.getByRole("button",{name:"List",exact:true}).click();
assert.equal(await page.locator(".ax-entity-list>div").count(),7);
await page.screenshot({path:out+"/estate-list.png"});
checks.push("Accessible estate list exposes all seven topology entities");
await page.getByRole("button",{name:"Collapse navigation"}).click();
assert.equal(await page.locator(".ax-collapsed").count(),1);
await page.getByRole("button",{name:"Expand navigation"}).click();
checks.push("Explicit rail collapse and expand");
for(const scenario of ["healthy","stale","outage"]){
 await go("/?scenario="+scenario);
 await page.screenshot({path:out+"/"+scenario+".png",fullPage:true});await scan(scenario);
}
await go("/?scenario=outage");
await page.getByRole("button",{name:"All clear",exact:true}).click();
await page.getByRole("heading",{name:"Nothing to resolve."}).waitFor();
checks.push("Deterministic outage-to-healthy scenario transition (not live recovery)");
for(const route of ["/systems","/agents","/media","/projects","/activity","/settings"]){
 await go(route);assert.equal(await page.locator("h1").count(),1);
 assert.equal(await page.getByRole("navigation",{name:"Primary",exact:true}).locator('[aria-current="page"]').count(),1);
 await scan(route);
}
await page.emulateMedia({reducedMotion:"reduce"});await go();
assert.equal(await page.evaluate(()=>document.getAnimations().length),0);
await page.screenshot({path:out+"/reduced-motion.png",fullPage:true});
await page.emulateMedia({forcedColors:"active"});await page.screenshot({path:out+"/high-contrast.png",fullPage:true});
await page.emulateMedia({forcedColors:"none",reducedMotion:"no-preference"});
await page.setViewportSize({width:720,height:500});await go(); // 1440 CSS width at 200% browser zoom equivalent
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),720);
await page.screenshot({path:out+"/zoom-200-equivalent.png",fullPage:true});
checks.push("200% reflow equivalent: 1440px display / 720 CSS px, no overflow");
const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const touch=await mobile.newPage();await touch.goto("http://127.0.0.1:3101/",{waitUntil:"networkidle"});
await touch.getByRole("button",{name:"Inspect media",exact:true}).tap();
await touch.getByRole("dialog").waitFor();
await touch.keyboard.press("Tab");
const trapped=await touch.evaluate(()=>document.activeElement?.closest("dialog")!==null);assert.equal(trapped,true);
assert.equal(await touch.getByRole("dialog").evaluate(e=>e.getBoundingClientRect().width),390);
await touch.screenshot({path:out+"/mobile-inspector.png"});
await touch.getByRole("button",{name:"Close Media",exact:true}).tap();
await touch.getByRole("button",{name:"More",exact:true}).tap();
await touch.getByRole("dialog",{name:"All destinations"}).waitFor();
await touch.getByRole("navigation",{name:"More destinations"}).getByRole("link",{name:"Settings"}).tap();
await touch.waitForURL("**/settings");
const touchSmall=await touch.evaluate(()=>[...document.querySelectorAll(".ax-app button,.ax-app a")].filter(e=>{const r=e.getBoundingClientRect();return r.width>1&&r.height>1&&(r.height<43||r.width<43)}).map(e=>({text:e.textContent,height:e.getBoundingClientRect().height,width:e.getBoundingClientRect().width})));
assert.deepEqual(touchSmall,[]);
checks.push("Touch inspector, modal focus containment, More navigation and 44px touch targets");
await mobile.close();
const videoPath=await page.video().path();
await context.close();await browser.close();
fs.copyFileSync(videoPath,out+"/interaction-review.webm");
const report={checks,layout,errors,api,a11y};
fs.writeFileSync(out+"/verification.json",JSON.stringify(report,null,2));
console.log(JSON.stringify({checks,layout,errors,api,violations:a11y.flatMap(s=>s.violations.map(v=>({screen:s.name,...v})))},null,2));
assert.deepEqual(errors,[]);assert.deepEqual(api,[]);
assert.equal(a11y.flatMap(s=>s.violations).filter(v=>v.impact==="serious"||v.impact==="critical").length,0);
