import fs from 'node:fs';
import {buildProjectTwin,assessProjectTwin,detectIntentContradictions,buildFounderProposal,adoptMission,routeDeviation,evaluateHomeostasis} from '../src/founder-mode.mjs';

const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url),'utf8'));
const fail=m=>{throw new Error('ANK PIE Founder Mode QA: '+m)};
const policy=read('../governance/founder-mode-v1.json');

if(policy.policy_id!=='ANK_PIE_FOUNDER_MODE_V1')fail('wrong policy id');
if(policy.founder_rule!=='THE_FOUNDER_IS_NOT_COMPANY_MIDDLEWARE')fail('founder rule drift');
for(const s of ['OBSERVE','UNDERSTAND','PROPOSE','AGREE','TAKE_OWNERSHIP','BUILD','RED_TEAM','VERIFY','RELEASE','HOMEOSTASIS'])
  if(!policy.canonical_loop.includes(s))fail('missing loop state '+s);
if(policy.default_authority_envelope.permission_change!=='DENY_SELF_CHANGE')fail('self permission guard missing');

const twin=buildProjectTwin({
  project_key:'mn.release',
  observed_intent:'Ship approved learner value without parked promotions.',
  observed_reality:{release_pr:577},
  locked_decisions:[{key:'mn.founding100',state:'PARKED'}],
  evidence:['github:pr-577'],
  contradictions:[{key:'mn.founding100',severity:'IMPORTANT'}],
  confidence:0.95
});
if(assessProjectTwin(twin).reason!=='INTENT_DRIFT')fail('project twin did not surface intent drift');

const contradictions=detectIntentContradictions({
  lockedDecisions:[{key:'mn.founding100',state:'PARKED',evidence_refs:['founder:decision']}],
  observedCommitments:[{key:'mn.founding100',state:'IN_RELEASE',evidence_refs:['github:pr-577']}]
});
if(contradictions.length!==1)fail('intent drift not detected');

const proposal=buildFounderProposal({
  proposal_id:'PIE-FM-TRIAL-001',
  project_key:'ank.friday-release',
  observed_goal:'Ship the smallest credible free launch and keep it healthy afterwards.',
  evidence:['github:mn-pr-577','github:gc-pr-184'],
  assumptions:['Founding 100 remains parked unless the founder reverses that decision.'],
  contradictions,
  recommended_course:['Remove parked scope','verify release candidates','release only through existing gates','enter homeostasis'],
  definition_of_done:['release evidence','no unresolved P0 drift','homeostasis checks active'],
  authority_requested:{max_action_level:'EXECUTE_REVERSIBLE'}
});
if(proposal.state!=='READY_FOR_FOUNDER')fail('proposal state');

const mission=adoptMission({
  proposal,
  founder_decision:{decision:'ACCEPT',mission_id:'PIE-FM-001'},
  existing_authority:{max_action_level:'DRAFT'},
  human_gates:['PRODUCTION_RELEASE']
});
if(mission.authority_envelope.max_action_level!=='DRAFT')fail('mission illegally expanded authority');
if(!mission.human_gates.includes('PRODUCTION_RELEASE'))fail('existing human gate lost');

if(routeDeviation({severity:'NOTICE',reversible:true,known_repair:true})!=='AUTO_REPAIR')fail('routine repair escalated');
if(routeDeviation({severity:'CRITICAL',reversible:true,known_repair:true})!=='FOUNDER_GATE')fail('critical deviation not escalated');
const h=evaluateHomeostasis({desired_state:{release:'healthy'},observed_state:{release:'degraded'},deviations:[{severity:'NOTICE',reversible:true,known_repair:true}]});
if(h.health_state!=='DEGRADED'||h.repair_queue.length!==1)fail('homeostasis routing failed');

console.log(JSON.stringify({gate:'ank-pie-founder-mode',status:'PASS',pilot:'PIE-FM-TRIAL-001',contradictions:contradictions.length},null,2));
