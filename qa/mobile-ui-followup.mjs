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
const out=process.env.QA_OUT_DIR || '/tmp/mobile-followup-qa';fs.mkdirSync(out,{recursive:true});
// All API writes are intercepted below; this harness never changes server data.
const browser=await chromium.launch({headless:true,...(process.env.QA_CHROMIUM_EXE ? {executablePath:process.env.QA_CHROMIUM_EXE} : {}),args:['--no-sandbox']});
const user={id:'test-mobile',name:'Yohanes Anthony Saputra',phoneNumber:'081234567890',role:'mobility_user',profilePhotoUrl:null,accessibilityProfiles:[{profileId:'crutches',label:'Tongkat',isPrimary:true,toleranceOverrides:null}],volunteerProfile:null,blindProfile:{onboardingCompleted:true}};
const point=(coordinates)=>({type:'Point',coordinates});
const origin=[110.3729,-7.7651], destination=[110.3751,-7.7659];
const building={id:'test-building',name:'Perpustakaan Ramah Lansia',code:null,faculty:'Layanan umum',location:point(destination),floorCount:1,hasLift:false,hasAccessibleToilet:false,surveyedAt:null,accessibilityScore:null,scoreBreakdown:null};
let blocked=false, geocoderUnavailable=false, aiUnavailable=false, messagesSent=0, sessionStarts=0;
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
 else if(p.endsWith('/ai-planner/conversations')){if(aiUnavailable)return route.fulfill({status:503,headers:{'access-control-allow-origin':'*'},json:{success:false,error:{code:'AI_UNAVAILABLE',message:'Asisten sedang tidak tersedia.'}}});data={id:'qa-chat',status:'active',userId:user.id,createdAt:new Date().toISOString()};}
 else if(p.endsWith('/ai-planner/conversations/qa-chat/message')){const payload=route.request().postDataJSON();messagesSent++;const createdAt=new Date().toISOString();data={userMessage:{id:'user-'+messagesSent,sender:'user',content:payload.content,inputMode:'text',createdAt},assistantMessage:{id:'assistant-'+messagesSent,sender:'assistant',content:messagesSent===1?'Tentu. Ke mana Anda ingin pergi dan pukul berapa?':'Rencana ke perpustakaan sudah siap untuk Anda tinjau.',createdAt},readyToConfirm:messagesSent>1,extraction:{destinationText:building.name,destinationLocation:building.location,plannedTime:null,contextNotes:'Pengguna memerlukan pendamping.',matchSource:'building'}};}
 else if(p.endsWith('/transit-demo/recommend'))return route.fulfill({status:503,headers:{'access-control-allow-origin':'*'},json:{success:false,error:{code:'SERVICE_UNAVAILABLE',message:'Rekomendasi moda tidak tersedia.'}}});
 else if(p.endsWith('/sessions/start')){sessionStarts++;data={id:'qa-session',userId:user.id,destinationName:building.name,status:'active'};}
 return route.fulfill({headers:{'access-control-allow-origin':'*'},json:{success:true,data}});
});

await context.addInitScript(()=>{
 window.SpeechRecognition=class {
  start(){queueMicrotask(()=>this.onstart?.());}
  abort(){queueMicrotask(()=>this.onend?.());}
 };
});
const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
const results={};
for(const width of [320,360,390,430,768]) {
 await page.setViewportSize({width,height:844});
 await page.goto(base+'/settings');await page.locator('.profile-card').waitFor();
 const heading=await page.locator('.page-heading p').boundingBox();
 assert.ok(heading.width>Math.min(width*.6,300),`Settings subtitle too narrow at ${width}`);
 assert.ok(heading.height<80,`Settings subtitle too tall at ${width}`);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:out+`/settings-${width}.png`});
 await page.goto(base+'/place?id=test-building');await page.locator('.route-origin-search').waitFor();
 const originBox=await page.locator('.route-origin-search').boundingBox();assert.ok(originBox.height<210);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:out+`/origin-${width}.png`});
 await page.locator('.mobile-building-score').waitFor();
 const text=await page.locator('.mobile-building-score').innerText();assert.doesNotMatch(text,/—|·/);assert.match(text,/Belum tersedia/);assert.match(text,/Belum dinilai/);
 await page.locator('.mobile-building-score').scrollIntoViewIfNeeded();await page.screenshot({path:out+`/score-${width}.png`});
 results[width]={heading,originBox};
}
await page.setViewportSize({width:390,height:844});
await page.goto(base+'/home');await page.locator('.mf-sheet').waitFor();
await page.locator('.topbar [data-voice="control"]').click();
await page.getByRole('button',{name:'Izinkan & mulai',exact:true}).click();
await page.getByText('Suara aktif',{exact:true}).waitFor();
await page.screenshot({path:out+'/voice-badge.png'});
const voiceBox=await page.locator('#voice-session').boundingBox();assert.ok(voiceBox.height<=40);assert.ok(voiceBox.width<145);
await page.screenshot({path:out+'/voice-badge.png'});
await page.locator('#voice-session summary').click();await page.locator('#voice-session [data-voice="stop"]').click();assert.equal(await page.locator('#voice-session').isVisible(),false);
await page.goto(base+'/ai-planner');await page.getByRole('textbox',{name:'Pesan untuk Asisten Perjalanan'}).waitFor();
await page.getByRole('textbox',{name:'Pesan untuk Asisten Perjalanan'}).waitFor({state:'visible'});
await page.waitForFunction(()=>!document.querySelector('.planner-composer textarea').disabled);
assert.equal(await page.locator('.planner-disclosure').first().getAttribute('open'),null);
await page.screenshot({path:out+'/chat-initial.png'});
for(const message of ['Saya ingin bepergian dan memerlukan pendamping.','Ke perpustakaan, pukul sembilan pagi.']) {
 await page.getByRole('textbox',{name:'Pesan untuk Asisten Perjalanan'}).fill(message);
 await page.getByRole('button',{name:'Kirim pesan',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('.planner-composer textarea').disabled);
}
assert.equal(await page.locator('.planner-message.is-user').count(),2);
assert.equal(await page.locator('.planner-message.is-assistant').count(),3);
await page.locator('.planner-review-link').waitFor();assert.equal(sessionStarts,0);
await page.screenshot({path:out+'/chat-replies.png'});
await page.locator('.planner-review-link').click();await page.locator('#review-plan-heading').waitFor();
await page.screenshot({path:out+'/chat-plan.png'});
for(const width of [320,360,430,768]) {
 await page.setViewportSize({width,height:844});await page.goto(base+'/ai-planner');
 await page.getByRole('textbox',{name:'Pesan untuk Asisten Perjalanan'}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Chat overflow at ${width}`);
 await page.screenshot({path:out+`/chat-${width}.png`});
}
aiUnavailable=true;await page.goto(base+'/ai-planner');await page.locator('#ai-fallback-title').waitFor();
assert.equal(await page.locator('.planner-disclosure[open]').count(),1);
await page.screenshot({path:out+'/chat-unavailable.png'});
aiUnavailable=false;
for(const width of [961,1440]) {
 await page.setViewportSize({width,height:1000});await page.goto(base+'/ai-planner');
 await page.getByRole('heading',{name:'Perencana Perjalanan',exact:true}).waitFor();
 assert.equal(await page.locator('.planner-disclosure').count(),0);
 assert.equal(await page.getByRole('textbox',{name:'Ketik tujuan perjalanan'}).isVisible(),true);
 await page.goto(base+'/place?id=test-building');
 await page.locator('select[aria-label="Titik asal rute"]').waitFor();
 assert.equal(await page.locator('.mobile-building-score').count(),0);
 await page.goto(base+'/');
 assert.equal(await page.getByRole('button',{name:'Buka menu navigasi',exact:true}).isVisible(),false);
}
results.voiceBox=voiceBox;results.messagesSent=messagesSent;results.errors=errors;assert.equal(errors.length,0,errors.join('\n'));
fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));await browser.close();
