import { chromium } from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const out='docs/screenshots/axiom-live';fs.mkdirSync(out,{recursive:true});
const b=await chromium.launch({headless:true});
const ctx=await b.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:out+'/video',size:{width:1440,height:1000}}});
const p=await ctx.newPage();const errors=[],layout=[],a11y=[],checks=[],requests=[];
p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{const u=new URL(r.url());if(u.pathname.startsWith('/api/'))requests.push({path:u.pathname,at:Date.now()});});
await p.addInitScript(()=>{window.axVital={cls:0,lcp:0};new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)window.axVital.cls+=e.value;}).observe({type:'layout-shift',buffered:true});new PerformanceObserver(list=>{for(const e of list.getEntries())window.axVital.lcp=e.startTime;}).observe({type:'largest-contentful-paint',buffered:true});});
async function go(path='/'){await p.goto('http://127.0.0.1:3101'+path,{waitUntil:'networkidle'});await p.waitForTimeout(500);}
async function scan(name){await p.addScriptTag({path:'node_modules/axe-core/axe.min.js'});a11y.push({name,violations:await p.evaluate(async()=> (await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})))});}
const paths=['/','/systems','/agents','/media','/projects','/activity','/settings'];
for(const width of [390,768,1024,1440,1920]){
 await p.setViewportSize({width,height:1000});
 for(const path of paths){
  await go(path);const name=(path==='/'?'command':path.slice(1))+'-'+width;
  const measured=await p.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,h1:document.querySelectorAll('h1').length,animations:document.getAnimations().length,vitals:window.axVital}));layout.push({name,...measured});
  if(path==='/'||width===390||width===1440)await p.screenshot({path:out+'/'+name+'.png',fullPage:true});
  if(width===390&&path==='/')await p.screenshot({path:out+'/390-viewport.png'});
  if(width===390||width===1440)await scan(name);
 }
 console.log('Captured width '+width);
}
await p.setViewportSize({width:1440,height:1000});await go();
const inspect=p.getByRole('button',{name:/^Inspect /}).first();const label=await inspect.getAttribute('aria-label');await inspect.click();await p.getByRole('dialog').waitFor();assert.equal(await p.locator('#ax-dialog-title').evaluate(e=>document.activeElement===e),true);await p.screenshot({path:out+'/inspector.png'});await scan('inspector');await p.keyboard.press('Escape');assert.equal(await p.getByRole('button',{name:label,exact:true}).evaluate(e=>document.activeElement===e),true);checks.push('Inspector: heading focus, Escape, focus restoration');
await inspect.click();const deep=p.url();await p.reload({waitUntil:'networkidle'});await p.getByRole('dialog').waitFor();assert.equal(p.url(),deep);await p.keyboard.press('Escape');checks.push('Inspector deep-link reload');
await p.keyboard.press('/');await p.getByRole('dialog',{name:'Command palette'}).waitFor();await p.getByLabel('Find a destination').fill('systems');assert.equal(await p.getByRole('navigation',{name:'Command results'}).getByRole('link').count(),1);await p.screenshot({path:out+'/palette.png'});await p.keyboard.press('Escape');checks.push('Keyboard command palette and filtering');
await go('/systems');await p.getByLabel('Find a system').fill('no-such-system');await p.getByText('No matching systems in the available inventory.').waitFor();checks.push('System inventory filtering');
await go('/agents');await p.getByLabel('Message to assistant').fill('/');assert.equal(await p.getByRole('dialog').count(),0);await p.getByLabel('Message to assistant').fill('');checks.push('Editable-field shortcut guard');
// Browser-only service failures: never disrupt a real backend.
await go();await p.route('**/api/widgets/homelab',r=>r.fulfill({status:503,json:{status:'error',data:null,updatedAt:new Date().toISOString()}}));
await p.evaluate(()=>{window.dispatchEvent(new Event('offline'));window.dispatchEvent(new Event('online'));});await p.waitForTimeout(1500);assert.ok(await p.getByText('Last known data. Current state is not confirmed.',{exact:true}).count());await p.screenshot({path:out+'/one-source-stale.png',fullPage:true});checks.push('One-source outage keeps labeled last-known estate');
await p.unroute('**/api/widgets/homelab');await p.evaluate(()=>{window.dispatchEvent(new Event('offline'));window.dispatchEvent(new Event('online'));});await p.waitForTimeout(2000);checks.push('Online refresh recovery');
await p.route('**/api/**',r=>r.fulfill({status:503,json:{status:'error',data:null,updatedAt:new Date().toISOString()}}));await go();assert.match(await p.locator('h1').innerText(),/visibility lost/);await p.screenshot({path:out+'/total-failure.png',fullPage:true});await scan('total-failure');checks.push('Total-source failure does not claim health');await p.unroute('**/api/**');
await go();await p.emulateMedia({reducedMotion:'reduce'});await p.screenshot({path:out+'/reduced-motion.png',fullPage:true});assert.equal(await p.evaluate(()=>document.getAnimations().length),0);await p.emulateMedia({forcedColors:'active'});await p.screenshot({path:out+'/forced-colors.png',fullPage:true});await p.emulateMedia({forcedColors:'none',reducedMotion:'no-preference'});
await p.setViewportSize({width:720,height:1000});await go();await p.screenshot({path:out+'/200-percent-reflow.png',fullPage:true});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),720);checks.push('200% equivalent reflow (not browser-menu zoom)');
// Request inventory and idle main-thread work in one stable 59-second window.
await p.setViewportSize({width:1440,height:1000});requests.length=0;const start=Date.now();await go();const cdp=await ctx.newCDPSession(p);await cdp.send('Performance.enable');const before=await cdp.send('Performance.getMetrics');await p.waitForTimeout(Math.max(0,59000-(Date.now()-start)));const after=await cdp.send('Performance.getMetrics');
const metric=(result,name)=>result.metrics.find(m=>m.name===name)?.value??0;const bundle=await p.evaluate(()=>performance.getEntriesByType('resource').filter(r=>r.name.includes('.js')).reduce((sum,r)=>sum+r.decodedBodySize,0));
const performance={windowMs:Date.now()-start,requests:[...requests],count:requests.length,decodedJavaScript:bundle,idleTaskSeconds:metric(after,'TaskDuration')-metric(before,'TaskDuration'),vitals:await p.evaluate(()=>window.axVital)};
const report={layout,a11y,errors,checks,performance};fs.writeFileSync(out+'/verification.json',JSON.stringify(report,null,2));
await ctx.close();await b.close();console.log(JSON.stringify({errors,overflows:layout.filter(x=>x.scroll>x.width),headings:layout.filter(x=>x.h1!==1),a11y:a11y.filter(x=>x.violations.length),performance:{...performance,requests:undefined}},null,2));
