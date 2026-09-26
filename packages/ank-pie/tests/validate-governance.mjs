import fs from 'node:fs';
import {assertStandardsSpine,resolveAgentChart,evaluateSource,evaluateAction,effectiveCeiling} from '../src/governance.mjs';

const read=(p)=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url),'utf8'));
const fail=m=>{throw new Error('ANK PIE Governance QA: '+m)};
const spine=read('../standards/standards-spine-v1.json');
const academy=read('../academy/public-source-academy-v1.json');
const constitution=read('../governance/agent-constitution-v1.json');
const natal=read('../governance/agent-natal-charts-v1.json');
const conditions=read('../governance/operating-conditions-v1.json');
const operators=read('../operators/operator-profiles-v1.json');

assertStandardsSpine(spine);
if(academy.model_weight_training!==false)fail('academy must not claim model-weight training');
if(constitution.first_principle!=='NO_AGENT_CAN_GRANT_ITSELF_MORE_AUTHORITY')fail('self-authority invariant missing');
if(!constitution.runtime_controls?.kill_switch_required)fail('kill switch missing');
if(!natal.african_house?.required_fields?.includes('data_sovereignty_check'))fail('African House incomplete');
if((natal.houses||[]).length!==12)fail('natal chart must preserve 12 operational houses');

const referenced=new Set((operators.profiles||[]).flatMap(p=>p.agent_refs||[]));
for(const agentId of referenced){
  const c=resolveAgentChart(natal,agentId);
  if(!c)fail('operator agent has no natal chart: '+agentId);
  if(!c.african_house?.african_sources_required)fail('African House not active: '+agentId);
  for(const p of Object.keys(natal.planets))if(!(p in c.planets))fail(agentId+' missing planet '+p);
}

const iso=spine.sources.find(x=>x.source_id==='ISO_IEC_42001_2023');
if(evaluateSource(iso,{intent:'FULL_TEXT_INGEST'}).decision!=='DENY')fail('unlicensed ISO full text not blocked');
const withdrawn=spine.sources.find(x=>x.source_id==='SA_DRAFT_AI_POLICY_2026_WITHDRAWN');
if(evaluateSource(withdrawn,{intent:'CURRENT_AUTHORITY'}).decision!=='DENY')fail('withdrawn SA AI draft treated as current');

const growth=resolveAgentChart(natal,'ank-growth');
if(evaluateAction({chart:growth,constitution,conditions,requested_level:'DRAFT'}).decision!=='ALLOW')fail('safe draft blocked');
if(evaluateAction({chart:growth,constitution,conditions,requested_level:'EXECUTE_REVERSIBLE'}).decision!=='DENY')fail('growth exceeded Mars ceiling');
const builder=resolveAgentChart(natal,'ank-build');
if(effectiveCeiling(builder,conditions,['SECURITY_INCIDENT'])!=='RECOMMEND')fail('security incident did not downgrade builder');

console.log(JSON.stringify({gate:'ank-pie-governance',status:'PASS',charts:natal.agent_assignments.length,sources:spine.sources.length},null,2));
