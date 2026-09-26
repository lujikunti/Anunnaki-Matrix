import fs from 'node:fs';
const fail=(m)=>{throw new Error('ANK Commercialisation QA: '+m)};
const policy=JSON.parse(fs.readFileSync(new URL('../training/commercialisation-v1.json', import.meta.url),'utf8'));
const portfolio=JSON.parse(fs.readFileSync(new URL('../training/fast-sell-portfolio-v1.json', import.meta.url),'utf8'));
const growth=JSON.parse(fs.readFileSync(new URL('../agents/ank-growth-v1.json', import.meta.url),'utf8'));
const profiles=JSON.parse(fs.readFileSync(new URL('../operators/operator-profiles-v1.json', import.meta.url),'utf8'));

if(policy.policy_id!=='ANK_COMMERCIALISATION_V1')fail('wrong policy id');
if(!/paid/i.test(policy.principle)||!/does not create products/i.test(policy.principle))fail('anti-product-factory rule missing');
for(const x of ['invent_market_demand','invent_costs','build_new_sku_before_market_gate','count_free_interest_as_paid_validation'])if(!policy.hard_prohibitions.includes(x))fail('missing prohibition '+x);
for(const c of ['swot_analysis','demand_evidence_assessment','unit_economics_draft','fast_sell_gate','commercial_product_passport','brochure_brief','website_product_page_draft','product_kill_recommendation'])if(!growth.agent.capabilities.includes(c))fail('growth missing commercial capability '+c);
const track=profiles.training_tracks?.revenue_v1;
for(const c of ['swot_analysis','demand_evidence_assessment','unit_economics_draft','fast_sell_gate','commercial_product_passport'])if(!track.capability_curriculum.includes(c))fail('revenue track missing '+c);

const allowed=new Set(policy.statuses);
const items=[...(portfolio.gc?.test_now||[]),...(portfolio.mn?.test_now||[])];
if(items.length<2)fail('portfolio too small to validate');
for(const p of items){
  if(!allowed.has(p.status))fail(p.product_key+': bad status');
  for(const k of ['strengths','weaknesses','opportunities','threats'])if(!Array.isArray(p.swot?.[k])||!p.swot[k].length)fail(p.product_key+': SWOT '+k);
  if(!Array.isArray(p.demand_evidence)||p.demand_evidence.length<2)fail(p.product_key+': demand evidence <2');
  if(p.engineering_expansion_allowed!==false)fail(p.product_key+': unvalidated engineering expansion allowed');
  if(!p.brochure_allowed)fail(p.product_key+': test asset not allowed');
}
if(portfolio.gc.default_for_unlisted_fixed_scope_products!=='PARK')fail('unlisted GC products must park');
if(portfolio.mn.commercial_rule.includes('new exam-season SKU')===false)fail('MN no-new-SKU rule missing');
if(items.some(p=>p.status==='SELL_NOW'))fail('portfolio claims SELL_NOW before paid validation evidence exists');
console.log('ANK Commercialisation QA passed');
