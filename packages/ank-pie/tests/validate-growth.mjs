import fs from 'node:fs';

const fail=(m)=>{throw new Error('ANK PIE Growth QA: '+m)};
const m=JSON.parse(fs.readFileSync(new URL('../agents/ank-growth-v1.json', import.meta.url),'utf8'));
if(m.policy_id!=='ANK_GROWTH_AGENT_V1') fail('wrong policy id');
if(m.distribution_mode!=='PULL_FIRST') fail('growth must remain pull-first');
if(m.cold_outbound_default!=='DISABLED') fail('cold outbound unexpectedly enabled');

const a=m.agent||{};
if(a.agent_id!=='ank-growth') fail('wrong agent id');
if(a.autonomy_ceiling!=='EXECUTE_REVERSIBLE') fail('autonomy ceiling drift');

for(const x of ['external_message','public_publication'])
  if(!(a.human_gates||[]).includes(x)) fail('missing human gate: '+x);

for(const x of ['cold_email','cold_dm','unsolicited_bulk_message','scrape_personal_contact_data','fake_review','astroturfing','impersonation'])
  if(!(a.forbidden_actions||[]).includes(x)) fail('missing forbidden action: '+x);

for(const x of ['market_signal_scan','search_opportunity_research','founder_content_draft','distribution_plan','inbound_lead_qualification','attribution_analysis'])
  if(!(a.capabilities||[]).includes(x)) fail('missing capability: '+x);

const forbidden=new Set(a.forbidden_actions||[]);
const can=(action)=>(a.capabilities||[]).includes(action)&&!forbidden.has(action);
if(can('cold_email')||can('cold_dm')) fail('cold outbound executable');
if(!can('market_signal_scan')||!can('inbound_lead_qualification')) fail('safe growth work unexpectedly blocked');

console.log(JSON.stringify({gate:'ank-pie-growth',status:'PASS',agent:a.agent_id,mode:m.distribution_mode},null,2));
