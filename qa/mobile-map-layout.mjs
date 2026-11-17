// Run from the repository root with a local frontend server on port 3000.
// API responses (including session writes) are mocked; screenshots stay in /tmp.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
// Use QA_PLAYWRIGHT_MODULE or an existing npx installation; no new project dependency.
const npxRoot = path.join(os.homedir(), '.npm', '_npx');
const candidates = [process.env.QA_PLAYWRIGHT_MODULE, ...fs.readdirSync(npxRoot).map(dir => path.join(npxRoot, dir, 'node_modules/playwright/index.mjs'))].filter(Boolean);
const modulePath = candidates.find(candidate => fs.existsSync(candidate));
if (!modulePath) throw new Error('Set QA_PLAYWRIGHT_MODULE to playwright/index.mjs.');
const { chromium } = await import(pathToFileURL(modulePath).href);
const out=process.env.QA_OUT_DIR || '/tmp/mobile-qa';fs.mkdirSync(out,{recursive:true});
// All API writes are intercepted below; this harness never changes server data.
const browser=await chromium.launch({headless:true,...(process.env.QA_CHROMIUM_EXE ? {executablePath:process.env.QA_CHROMIUM_EXE} : {}),args:['--no-sandbox']});
const user={id:'test-mobile',name:'Yohanes Anthony Saputra',phoneNumber:'081234567890',role:'mobility_user',profilePhotoUrl:null,accessibilityProfiles:[{profileId:'crutches',label:'Tongkat',isPrimary:true,toleranceOverrides:null}],volunteerProfile:null,blindProfile:{onboardingCompleted:true}};
const point=(coordinates)=>({type:'Point',coordinates});
const origin=[110.3729,-7.7651], destination=[110.3751,-7.7659];
const building={id:'test-building',name:'Perpustakaan Ramah Lansia',code:null,faculty:'Layanan umum',location:point(destination),floorCount:1,hasLift:false,hasAccessibleToilet:false,surveyedAt:null,accessibilityScore:null,scoreBreakdown:null};
let blocked=false, geocoderUnavailable=false;
const searches=[];
const base=process.env.QA_BASE_URL || 'http://localhost:3000';
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,permissions:['geolocation'],geolocation:{longitude:origin[0],latitude:origin[1]}});
await context.addInitScript(()=>{localStorage.setItem('unstoppable-refresh-v1','qa-only');localStorage.setItem('unstoppable-demo-v1',JSON.stringify({voice:false}));});
await context.route(/\/(?:api\/|health(?:\?|$))/,async route=>{
 const url=new URL(route.request().url()),p=url.pathname;
 if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
 if(p==='/health')return route.fulfill({headers:{'access-control-allow-origin':'*'},json:{status:'ok',db:'ok'}});
 let data=[];
 if(p.endsWith('/auth/refresh'))data={accessToken:'test-access',refreshToken:'qa-only'};
 else if(p.endsWith('/users/me'))data=user;
 else if(p.endsWith('/buildings'))data=[building];
 else if(p.endsWith('/accessibility-score'))data={...building,buildingId:building.id};
 else if(p.endsWith('/buildings/test-building'))data=building;
 else if(p.endsWith('/notifications/unread-count'))data={count:0};
 else if(p.endsWith('/geocode/search')){if(geocoderUnavailable)return route.fulfill({status:503,headers:{'access-control-allow-origin':'*'},json:{success:false,error:{code:'GEOCODER_UNAVAILABLE',message:'Pencarian lokasi sedang tidak tersedia.'}}});searches.push(Object.fromEntries(url.searchParams));data=[{name:'Monumen Nasional',address:'Gambir, Jakarta, Indonesia',location:point([106.8272,-6.1754])}];}
 else if(p.endsWith('/geocode/reverse'))data={name:'Lokasi perangkat',address:'Yogyakarta',location:point(origin)};
 else if(p.endsWith('/routes/plan')){
   if(blocked)return route.fulfill({status:422,headers:{'access-control-allow-origin':'*'},json:{success:false,error:{code:'ROUTE_UNREACHABLE',message:'Tujuan ini belum bisa dijangkau secara mandiri dengan profil tongkat.',details:{reasons:[{type:'NO_PATH',message:'Tidak ada jalur yang menghubungkan titik asal dan tujuan di graf.'}]}}}});
   data={reachable:true,profileId:'crutches',totalDistanceM:260,estimatedDurationMin:6,edgeIds:['edge-qa'],geometry:{type:'LineString',coordinates:[origin,[110.3735,-7.7655],destination]},steps:[{order:1,instruction:'Lanjutkan di trotoar',distanceM:260,edgeId:'edge-qa'}],barriers:[],dataFreshness:{surveyedAt:null}};
 }
 else if(p.endsWith('/sessions/start'))data={id:'qa-session',userId:user.id,destinationName:building.name,status:'active'};
 return route.fulfill({headers:{'access-control-allow-origin':'*'},json:{success:true,data}});
});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(base+'/');await page.getByRole('button',{name:'Buka menu navigasi',exact:true}).click();await page.screenshot({path:out+'/landing-menu.png'});await page.keyboard.press('Escape');
await page.goto(base+'/home');await page.locator('.mf-sheet').waitFor();await page.waitForTimeout(2000);
const measure=async()=>page.evaluate(()=>{const rect=s=>{const el=document.querySelector(s);if(!el)return null;const r=el.getBoundingClientRect(),st=getComputedStyle(el);return {x:r.x,y:r.y,w:r.width,h:r.height,display:st.display,position:st.position,font:st.fontSize};};return {route:location.pathname,sheet:document.body.dataset.sheet,overflow:document.documentElement.scrollWidth>innerWidth,map:rect('.map'),panel:rect('.mf-sheet'),caption:rect('.map-caption'),buttons:rect('.preview-actions'),family:rect('.trip-top-status'),label:rect('.route-map-label'),sos:rect('.fixed-sos'),nav:rect('.bottom-nav')};});
const labelClear = () => page.evaluate(() => {
 const el=document.querySelector('.route-map-label');if(!el)return false;
 const rect=el.getBoundingClientRect();
 return [...document.querySelectorAll('path[stroke="#a36a00"]')].every(path => {
  const length=path.getTotalLength();
  for(let n=0;n<=100;n++) {
   const point=path.getPointAtLength(length*n/100).matrixTransform(path.getScreenCTM());
   if(point.x>=rect.left-6 && point.x<=rect.right+6 && point.y>=rect.top-6 && point.y<=rect.bottom+6)return false;
  }
  return true;
 });
});
const results={home:await measure()};await page.screenshot({path:out+'/home.png'});
await context.setGeolocation({longitude:110.3738,latitude:-7.7661});await page.waitForTimeout(200);
await page.goto(base+'/search');await page.getByRole('combobox',{name:'Cari tujuan'}).fill('Monumen Nasional');await page.getByRole('option').filter({hasText:'Monumen Nasional'}).waitFor();await page.getByRole('button',{name:'Cari',exact:true}).click();await page.waitForURL('**/place?name=Monumen*');await page.screenshot({path:out+'/external-place.png'});results.externalPlace=page.url();results.searches=searches;assert.equal(searches.at(-1).lng,'110.3738');assert.equal(searches.at(-1).lat,'-7.7661');
await page.goto(base+'/place?id=test-building');await page.getByRole('button',{name:'Cari rute ke sini',exact:true}).waitFor();await page.screenshot({path:out+'/place.png'});
await page.getByRole('button',{name:'Cari rute ke sini',exact:true}).click();await page.waitForURL('**/preview');await page.waitForTimeout(2200);results.preview=await measure();assert.equal(await labelClear(),true,'Route label covers route');await page.screenshot({path:out+'/preview.png'});
await page.locator('.sheet-handle').click();await page.waitForTimeout(500);results.previewExpanded=await measure();await page.screenshot({path:out+'/preview-expanded.png'});
await page.getByRole('button',{name:'Mulai perjalanan',exact:true}).click();await page.waitForURL('**/trip');await page.waitForTimeout(1200);results.trip=await measure();results.tripStyles=await page.locator('.trip-top-status').evaluate(el=>[el,...el.children,...el.querySelector('.trip-family').children].map(e=>({cls:e.className,rect:e.getBoundingClientRect().toJSON(),style:{minHeight:getComputedStyle(e).minHeight,padding:getComputedStyle(e).padding,gap:getComputedStyle(e).gap,margin:getComputedStyle(e).margin}})));await page.screenshot({path:out+'/trip.png'});
await page.goto(base+'/assistance-form');await page.locator('#loc-destination').waitFor();results.form=await measure();await page.waitForTimeout(4000);await page.screenshot({path:out+'/form.png'});
blocked=true;await page.goto(base+'/place?id=test-building');await page.getByRole('button',{name:'Cari rute ke sini',exact:true}).click();await page.waitForURL('**/unreachable');await page.screenshot({path:out+'/unreachable.png'});
results.unreachable=await measure();
for(const width of [320,360,430,768]){await page.setViewportSize({width,height:844});await page.goto(base+'/home');await page.locator('.mf-sheet').waitFor();await page.waitForTimeout(500);results['home'+width]=await measure();await page.screenshot({path:out+'/home-'+width+'.png'});}

// Origin selection uses the same world-wide address search and keeps a manual origin.
await page.setViewportSize({width:390,height:844});
await page.goto(base+'/search');await page.locator('#route-origin').click();
await page.getByRole('searchbox',{name:'Cari alamat atau nama tempat'}).fill('Monumen Nasional');
await page.getByRole('button').filter({hasText:'Monumen Nasional'}).click();
await page.getByRole('button',{name:'Pilih lokasi ini'}).click();
assert.match(await page.locator('#route-origin').innerText(),/Monumen Nasional/);
await context.setGeolocation({longitude:110.38,latitude:-7.77});await page.waitForTimeout(300);
assert.match(await page.locator('#route-origin').innerText(),/Monumen Nasional/);
geocoderUnavailable=true;
await page.goto(base+'/search');await page.getByRole('combobox',{name:'Cari tujuan'}).fill('Pencarian gagal');
await page.getByText('Pencarian lokasi lain sedang tidak tersedia.',{exact:false}).waitFor();
const deniedPage=await context.newPage();
await deniedPage.addInitScript(()=>{Object.defineProperty(navigator,'geolocation',{value:{
 watchPosition(success,error){queueMicrotask(()=>error({code:1}));return 1;},clearWatch(){},
 getCurrentPosition(success,error){queueMicrotask(()=>error({code:1}));},
}});});
await deniedPage.goto(base+'/search');
await deniedPage.getByText('Izinkan lokasi di browser untuk melihat posisi Anda.',{exact:true}).waitFor();
assert.equal(await deniedPage.getByRole('combobox',{name:'Cari tujuan'}).isVisible(),true);
await deniedPage.close();
for(const result of Object.values(results)) {
 if(result?.overflow !== undefined) assert.equal(result.overflow,false);
}
assert.equal(results.preview.buttons.position,'static');
assert.ok(results.home.caption.w < 250);
assert.ok(results.home.panel.y-results.home.map.y > 350);
assert.ok(results.trip.family.h < 90);
assert.equal(errors.length,0,errors.join('\n'));

for(const width of [961,1024,1280,1440]) {
 await page.setViewportSize({width,height:1000});await page.goto(base+'/');
 assert.equal(await page.getByRole('button',{name:'Buka menu navigasi',exact:true}).isVisible(),false,`Desktop hamburger at ${width}`);
 for(const name of ['Tentang','Cara kerja','Fitur','Masuk','Daftar']) assert.equal(await page.locator('.landing-nav').getByRole('link',{name,exact:true}).isVisible(),true,`${name} missing at ${width}`);
}
results.errors=errors;fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));await browser.close();
