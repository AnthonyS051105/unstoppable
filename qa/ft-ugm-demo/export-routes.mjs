// Export computed local demo routes without disclosing identities or credentials.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.env.FT_DEMO_OUT || '/tmp/unstoppable-ft-demo';
const api=process.env.FT_DEMO_API || 'http://localhost:4011/api';
assert.ok(['localhost','127.0.0.1'].includes(new URL(api).hostname));
const readLatest=(prefix,predicate=()=>true)=>fs.readdirSync(root).filter(f=>f.startsWith(prefix)&&f.endsWith('.json')).sort().reverse().map(f=>JSON.parse(fs.readFileSync(path.join(root,f)))).find(predicate);
const manifest=readLatest('manifest-');assert.ok(['localhost','127.0.0.1'].includes(manifest.targetHost));
const accounts=readLatest('credentials-',x=>x.accounts.length===5).accounts;
async function call(url,body,token){const response=await fetch(api+url,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});const result=await response.json();assert.ok(response.ok,result.error?.message);return result.data;}
const features=[];
for(const key of ['wheelchair','blind']){
 const account=accounts.find(a=>a.key===key);
 const auth=await call('/auth/login',{phoneNumber:account.phone,password:account.password});
 for(const c of manifest.cases){const route=await call('/routes/plan',{origin:{type:'Point',coordinates:c.origin.coord},destination:{type:'Point',coordinates:c.destination.coord},profileId:key},auth.accessToken);
 features.push({type:'Feature',properties:{case:c.key,profile:key,origin:c.origin.name,destination:c.destination.name,distanceM:route.totalDistanceM,durationMin:route.estimatedDurationMin,syntheticAccessibility:true,verifiedSurvey:false},geometry:route.geometry});}
}
for(const c of manifest.cases)for(const [kind,value] of [['origin',c.origin],['destination',c.destination],['report',c.report]])features.push({type:'Feature',properties:{case:c.key,kind,name:value.name || '[DEMO FT] Ramp terhalang',syntheticAccessibility:true},geometry:{type:'Point',coordinates:value.coord}});
const output=new URL('./routes.geojson',import.meta.url);fs.writeFileSync(output,JSON.stringify({type:'FeatureCollection',name:'FT UGM — DEMO, bukan survei aksesibilitas',attribution:'Road geometry © OpenStreetMap contributors, ODbL; accessibility attributes are synthetic.',features},null,2)+'\n');console.log('Exported four calculated routes and six demo points.');
