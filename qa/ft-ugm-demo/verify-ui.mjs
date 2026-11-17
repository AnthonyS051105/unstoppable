// Real local API + isolated browser identities; speech and GPS are simulated; no report/SOS API response is mocked.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const root=process.env.FT_DEMO_OUT || '/tmp/unstoppable-ft-demo';
const base=process.env.FT_DEMO_UI || 'http://localhost:3011', api=process.env.FT_DEMO_API || 'http://localhost:4011/api';
for(const url of [base,api])assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname));
const npx=path.join(os.homedir(),'.npm/_npx');
const modulePath=process.env.QA_PLAYWRIGHT_MODULE || fs.readdirSync(npx).map(d=>path.join(npx,d,'node_modules/playwright/index.mjs')).find(p=>fs.existsSync(p));
const {chromium}=await import(pathToFileURL(modulePath).href);
const browser=await chromium.launch({headless:true,...(process.env.QA_CHROMIUM_EXE?{executablePath:process.env.QA_CHROMIUM_EXE}:{}),args:['--no-sandbox']});
const latest=(prefix,predicate=()=>true)=>fs.readdirSync(root).filter(f=>f.startsWith(prefix)&&f.endsWith('.json')).sort().reverse().map(f=>JSON.parse(fs.readFileSync(path.join(root,f)))).find(predicate);
const manifest=latest('manifest-');assert.ok(['localhost','127.0.0.1'].includes(manifest.targetHost));
const credentials=latest('credentials-',x=>x.accounts.length===5).accounts;
const pages={},contexts={},tokens={},errors=[];
const shots=path.join(root,'screenshots');fs.mkdirSync(shots,{recursive:true});
const point=coordinates=>({type:'Point',coordinates});
async function request(key,url,body,expected=200){const response=await fetch(api+url,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(tokens[key]?{Authorization:`Bearer ${tokens[key]}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const result=await response.json();assert.equal(response.status,expected,result.error?.message || url);return result.data;}
let recipientSession,reportId,incidentId;
try {
 for(const cred of credentials){const auth=await request(cred.key,'/auth/login',{phoneNumber:cred.phone,password:cred.password});tokens[cred.key]=auth.accessToken;const context=await browser.newContext({viewport:cred.key==='wheelchair'?{width:390,height:844}:{width:1280,height:900},permissions:['geolocation'],geolocation:{longitude:manifest.cases[0].origin.coord[0],latitude:manifest.cases[0].origin.coord[1]}});contexts[cred.key]=context;
  await context.addInitScript(({refresh,senior,coord})=>{
   if(!localStorage.getItem('unstoppable-refresh-v1'))localStorage.setItem('unstoppable-refresh-v1',refresh);if(!localStorage.getItem('unstoppable-demo-v1'))localStorage.setItem('unstoppable-demo-v1',JSON.stringify({voice:senior}));window.__spoken=[];window.__recognizer=null;const pos=()=>({coords:{longitude:coord[0],latitude:coord[1],accuracy:5,altitude:null,altitudeAccuracy:null,heading:null,speed:0},timestamp:Date.now()});Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok){setTimeout(()=>ok(pos()),0)},watchPosition(ok){setTimeout(()=>ok(pos()),0);return 1},clearWatch(){}}});
   window.SpeechRecognition=class{start(){this.active=true;window.__recognizer=this;queueMicrotask(()=>this.onstart?.());}abort(){this.active=false;queueMicrotask(()=>this.onend?.());}};window.webkitSpeechRecognition=window.SpeechRecognition;
   window.__say=text=>{const recognition=window.__recognizer;if(!recognition?.active)throw new Error('Recognition is not listening');recognition.onresult?.({resultIndex:0,results:[{isFinal:true,0:{transcript:text}}]});};
   window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
   Object.defineProperty(window,'speechSynthesis',{value:{cancel(){},speak(utterance){window.__spoken.push(utterance.text);queueMicrotask(()=>utterance.onend?.());}}});
  },{refresh:auth.refreshToken,senior:cred.key==='wheelchair',coord:manifest.cases[0].origin.coord});
  const page=await context.newPage();page.setDefaultTimeout(12_000);page.setDefaultNavigationTimeout(15_000);page.on('pageerror',error=>errors.push({key:cred.key,error:error.message}));pages[cred.key]=page;
  await page.goto(base+'/home');await page.locator('.shell').waitFor();
 }
 const budi=pages.wheelchair;
 await budi.locator('.topbar [data-voice="control"]').click();await budi.getByRole('button',{name:'Izinkan & mulai',exact:true}).click();
 const say=async text=>{await budi.waitForTimeout(600);await budi.waitForFunction(()=>window.__recognizer?.active);await budi.evaluate(t=>window.__say(t),text);await budi.waitForTimeout(600);console.log('Voice:',text,await budi.locator('#voice-status').textContent().catch(()=>''));};
 await say('cari teknik geologi');await budi.waitForURL('**/place?id=*');
 await budi.getByRole('button',{name:'Cari rute ke sini',exact:true}).click();await budi.waitForURL('**/preview');
 await budi.locator('[data-action="start-trip"]:enabled').waitFor();await say('baca rute');await say('mulai perjalanan');await budi.waitForURL('**/trip');
 await say('langkah berikutnya');await say('ulangi petunjuk');
 assert.ok((await budi.evaluate(()=>window.__spoken)).length>=3);
 await budi.screenshot({path:path.join(shots,'01-lansia-panduan-suara.png')});
 await pages.caregiver.getByRole('link',{name:'Pantau Perjalanan',exact:true}).waitFor();await pages.caregiver.screenshot({path:path.join(shots,'02-keluarga-memantau.png')});
 await pages.volunteer.goto(base+'/dashboard');await pages.volunteer.locator('.shell').waitFor();
 const c=manifest.cases[0];const session=await request('blind','/sessions/start',{origin:point(c.origin.coord),destination:point(c.destination.coord),destinationName:c.destination.name,profileId:'blind',estimatedArrival:new Date(Date.now()+30*60_000).toISOString()},201);recipientSession=session.id;
 console.log('GPS',await budi.evaluate(()=>new Promise(resolve=>navigator.geolocation.getCurrentPosition(p=>resolve({lat:p.coords.latitude,lng:p.coords.longitude}),e=>resolve({error:e.message})))));const box=await budi.locator('.fixed-sos').boundingBox();await budi.mouse.move(box.x+box.width/2,box.y+box.height/2);await budi.mouse.down();await budi.waitForTimeout(1650);await budi.mouse.up();console.log('SOS held');await budi.waitForURL(/\/sos-(?:active|empty)$/, {waitUntil:'domcontentloaded'});console.log('SOS page:',budi.url());incidentId=await budi.evaluate(()=>JSON.parse(localStorage.getItem('unstoppable-active-sos-v1'))?.sosId);
 console.log('Checking family alert');await pages.caregiver.getByRole('button',{name:'Lihat lokasi SOS',exact:true}).waitFor();console.log('Family alert received');
 await pages.caregiver.getByRole('button',{name:'Lihat lokasi SOS',exact:true}).click();await pages.caregiver.getByRole('dialog').waitFor();
 await pages.caregiver.screenshot({path:path.join(shots,'03-keluarga-menerima-sos.png'),timeout:10_000});console.log('Family screenshot');
 await pages.volunteer.getByRole('button',{name:'Bantu / Menuju Lokasi',exact:true}).click();
 await budi.getByText('Menuju Anda',{exact:false}).first().waitFor();await budi.screenshot({path:path.join(shots,'04-lansia-status-relawan.png')});
 const raw=await budi.evaluate(()=>JSON.parse(localStorage.getItem('unstoppable-active-sos-v1')));await request('wheelchair',`/sos/${raw.sosId}/cancel`,{reason:'false_alarm'});
 await pages.caregiver.getByRole('dialog').getByRole('button',{name:'Tutup',exact:true}).click();
 // Send a genuine form-data report after opening an active recipient page; verify the frontend toast listener.
 await pages.blind.goto(base+'/home');await pages.blind.locator('.shell').waitFor();
 const data=new FormData();data.set('data',JSON.stringify({location:point(c.report.coord),category:'ramp_terhalang',severity:'high',description:'[DEMO FT] Uji notifikasi browser.'}));
 const response=await fetch(api+'/reports',{method:'POST',headers:{Authorization:`Bearer ${tokens.wheelchair}`},body:data});assert.equal(response.status,201);reportId=(await response.json()).data.id;
 await pages.blind.getByText('Laporan hambatan di sekitar perjalanan:',{exact:false}).first().waitFor();await pages.blind.screenshot({path:path.join(shots,'05-laporan-sekitar.png')});
 assert.equal(errors.length,0,JSON.stringify(errors));
 fs.writeFileSync(path.join(root,'ui-verification.json'),JSON.stringify({success:true,voiceCommands:['cari teknik geologi','baca rute','mulai perjalanan','langkah berikutnya','ulangi petunjuk'],familyAlert:true,volunteerResponse:true,nearbyReportToast:true,speechHardware:'not verified; deterministic speech and GPS simulation',errors},null,2));
 console.log('PASS: five roles authenticated; voice route, family SOS, volunteer response, and nearby report UI verified.');
}catch(error){for(const [key,page] of Object.entries(pages)){console.error(key,page.url());await page.screenshot({path:path.join(shots,`failure-${key}.png`)}).catch(()=>{});}throw error;}finally{
 if(incidentId)await request('wheelchair',`/sos/${incidentId}/cancel`,{reason:'false_alarm'}).catch(()=>{});
 if(reportId)await request('admin',`/verification/report_effect:${reportId}/reject`,{reason:'[DEMO FT] Uji browser selesai.'}).catch(()=>{});
 if(recipientSession)await request('blind',`/sessions/${recipientSession}/end`,{status:'cancelled'}).catch(()=>{});
 for(const key of ['wheelchair','blind']){const list=await request('caregiver','/users/me/dependents').catch(()=>[]);const active=list.find(d=>d.userId===manifest.users[key])?.activeSession;if(active)await request(key,`/sessions/${active.id}/end`,{status:'cancelled'}).catch(()=>{});}
 await browser.close();
}
