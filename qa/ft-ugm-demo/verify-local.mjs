// Exercises only a disposable local API using the five FT fixture identities. Never run against production.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(new URL('../../backend/package.json',import.meta.url));
const {io}=require('socket.io-client');
const root=process.env.FT_DEMO_OUT || '/tmp/unstoppable-ft-demo';
const api=process.env.FT_DEMO_API || 'http://localhost:4011/api';
assert.ok(['localhost','127.0.0.1'].includes(new URL(api).hostname),'Local API required');
const latest=(prefix,filter=()=>true)=>fs.readdirSync(root).filter(x=>x.startsWith(prefix)&&x.endsWith('.json')).sort().reverse().map(x=>({file:path.join(root,x),data:JSON.parse(fs.readFileSync(path.join(root,x)))})).find(x=>filter(x.data));
const manifest=latest('manifest-').data;
assert.ok(['127.0.0.1','localhost'].includes(manifest.targetHost),'Disposable DB required');
const credentials=latest('credentials-',x=>x.accounts.length===5).data.accounts;
const tokens={},received={},sockets=[];
const results={routes:[],sos:{},report:{},companion:{},mapping:{}};
async function call(key,url,body,expected=200) {
 const response=await fetch(api+url,{method:body===undefined?'GET':'POST',headers:{...(tokens[key]?{Authorization:`Bearer ${tokens[key]}`} : {}),...(body instanceof FormData?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:body instanceof FormData?body:JSON.stringify(body)})});
 const envelope=await response.json();assert.equal(response.status,expected,`${url}: ${envelope.error?.message || response.status}`);return envelope.data;
}
const point=coordinates=>({type:'Point',coordinates});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const sessions=[];let reportId,sosId,bookingId;
try {
 for(const a of credentials){const auth=await call(a.key,'/auth/login',{phoneNumber:a.phone,password:a.password});tokens[a.key]=auth.accessToken;const me=await call(a.key,'/users/me');assert.ok(me.name.startsWith('[DEMO FT]'));received[a.key]=[];
  const socket=io(new URL(api).origin,{auth:{token:tokens[a.key]},transports:['websocket']});socket.onAny((event,payload)=>received[a.key].push({event,payload}));await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);setTimeout(()=>reject(new Error('Socket connection timeout')),6000).unref();});sockets.push(socket);}
 for(const c of manifest.cases)for(const profile of ['wheelchair','blind']){const route=await call(profile,'/routes/plan',{origin:point(c.origin.coord),destination:point(c.destination.coord),profileId:profile});results.routes.push({case:c.key,profile,distanceM:route.totalDistanceM,durationMin:route.estimatedDurationMin,edgeIds:route.edgeIds,steps:route.steps.map(s=>s.instruction),surveyedAt:route.dataFreshness?.surveyedAt});}
 const c=manifest.cases[0];
 for(const profile of ['wheelchair','blind']){const route=results.routes.find(r=>r.case===c.key&&r.profile===profile);const started=await call(profile,'/sessions/start',{origin:point(c.origin.coord),destination:point(c.destination.coord),destinationName:c.destination.name,profileId:profile,edgeIds:route.edgeIds,estimatedArrival:new Date(Date.now()+30*60_000).toISOString()},201);sessions.push({key:profile,id:started.sessionId || started.id});}
 const deps=await call('caregiver','/users/me/dependents');assert.ok(deps.some(d=>d.userId===manifest.users.wheelchair&&d.activeSession));
 const reportData=new FormData();reportData.set('data',JSON.stringify({location:point(c.report.coord),category:c.report.category,severity:c.report.severity,description:c.report.description}));
 const report=await call('wheelchair','/reports',reportData,201);reportId=report.id;assert.equal(report.linkedEdgeId,c.report.edgeId);await sleep(150);
 assert.ok(received.blind.some(e=>e.event==='report:nearby'&&e.payload.reportId===report.id));
 assert.ok(!received.wheelchair.some(e=>e.event==='report:nearby'&&e.payload.reportId===report.id));
 await call('blind',`/reports/${report.id}/corroborate`,{},200);
 const approved=await call('admin',`/verification/report_effect:${report.id}/approve`,{effect:'block',note:'[DEMO FT] Penutupan ramp latihan.'});assert.equal(approved.effect,'block');
 const blockedResponse=await fetch(api+'/routes/plan',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${tokens.wheelchair}`},body:JSON.stringify({origin:point(c.origin.coord),destination:point(c.destination.coord),profileId:'wheelchair'})});
 assert.equal(blockedResponse.status,422);results.report={id:report.id,notified:['blind'],effect:'block',wheelchairAfterBlock:422};
 await call('admin',`/verification/report_effect:${report.id}/reject`,{reason:'[DEMO FT] Latihan selesai; baseline dipulihkan.'});reportId=undefined;
 const incident=await call('wheelchair','/sos/trigger',{triggerType:'manual_button',location:point(c.origin.coord),sessionId:sessions[0].id},201);sosId=incident.sosId;await sleep(150);
 assert.equal(incident.notifiedCaregivers,1);assert.equal(incident.notifiedVolunteers,1);
 assert.ok(received.caregiver.some(e=>e.event==='sos:triggered'&&e.payload.sosId===sosId));assert.ok(received.volunteer.some(e=>e.event==='sos:new'&&e.payload.sosId===sosId));
 assert.ok(!received.admin.some(e=>['sos:new','sos:triggered'].includes(e.event)));
 await call('volunteer',`/sos/${sosId}/respond`,{responseStatus:'en_route'},201);
 const status=await call('caregiver',`/sos/${sosId}/status`);assert.equal(status.responders[0].status,'en_route');
 results.sos={notifiedCaregivers:incident.notifiedCaregivers,notifiedVolunteers:incident.notifiedVolunteers,adminNotified:false,volunteerStatus:status.responders[0].status};
 await call('wheelchair',`/sos/${sosId}/cancel`,{reason:'false_alarm'});await sleep(150);assert.ok(received.volunteer.some(e=>e.event==='sos:resolved'&&e.payload.sosId===sosId));results.sos.respondingVolunteerNotifiedOnCancel=true;sosId=undefined;
 const booking=await call('wheelchair','/companions/requests',{destinationName:c.destination.name,destinationLocation:point(c.destination.coord),meetingPointLocation:point(c.origin.coord),scheduledStart:new Date(Date.now()+90*60_000).toISOString(),estimatedDurationMin:30,assistanceTypes:['bantu_kursi_roda'],notes:'[DEMO FT] Latihan pendampingan.'},201);
 bookingId=booking.id;
 const offer=await call('volunteer',`/companions/requests/${booking.id}/offer`,{message:'[DEMO FT] Saya siap mendampingi.'},201);
 await call('wheelchair',`/companions/requests/${booking.id}/select`,{offerId:offer.offerId});
 for(const checkinType of ['meet','complete'])for(const actor of ['wheelchair','volunteer'])await call(actor,`/companions/requests/${booking.id}/checkin`,{checkinType,location:point(c.origin.coord)},201);
 results.companion={requestId:booking.id,offerSelected:true,bothPartiesCompleted:true};
 const node=await call('volunteer','/graph/nodes',{nodeType:'junction',name:`[DEMO FT] Usulan uji ${Date.now()}`,location:point([110.3723,-7.7656]),floorLevel:0},201);
 const queue=await call('admin','/verification/queue?type=node&limit=100');assert.ok((Array.isArray(queue)?queue:queue?.data||[]).some(n=>n.itemId===String(node.id)));
 await call('admin',`/verification/node:${node.id}/reject`,{reason:'[DEMO FT] Usulan uji selesai.'});results.mapping={draftCreated:true,visibleToAdmin:true,rejectedAfterTest:true};
 results.success=true;
} finally {
 if(bookingId)await call('wheelchair',`/companions/requests/${bookingId}/cancel`,{reason:'[DEMO FT] Cleanup uji.'}).catch(()=>{});
 if(sosId)await call('wheelchair',`/sos/${sosId}/cancel`,{reason:'false_alarm'}).catch(()=>{});
 if(reportId)await call('admin',`/verification/report_effect:${reportId}/reject`,{reason:'[DEMO FT] Cleanup pengujian.'}).catch(()=>{});
 for(const s of sessions)await call(s.key,`/sessions/${s.id}/end`,{status:'cancelled'}).catch(()=>{});
 for(const socket of sockets)socket.disconnect();
 fs.writeFileSync(path.join(root,'verification.json'),JSON.stringify(results,null,2)+'\n',{mode:0o600});
}
console.log(JSON.stringify(results,null,2));
