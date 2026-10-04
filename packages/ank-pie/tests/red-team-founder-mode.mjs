import {buildFounderProposal,adoptMission,routeDeviation,evaluateHomeostasis} from '../src/founder-mode.mjs';
const fail=m=>{throw new Error('ANK PIE Founder Mode Red Team: '+m)};

let threw=false;
try{buildFounderProposal({project_key:'x'});}catch{threw=true}
if(!threw)fail('empty evidence proposal admitted');

const proposal=buildFounderProposal({
  proposal_id:'p',
  project_key:'x',
  observed_goal:'goal',
  evidence:['e'],
  assumptions:['a'],
  recommended_course:['r'],
  definition_of_done:['d'],
  authority_requested:{max_action_level:'EXECUTE_CONSEQUENTIAL'}
});
const mission=adoptMission({
  proposal,
  founder_decision:{decision:'ACCEPT'},
  existing_authority:{max_action_level:'EXECUTE_REVERSIBLE'},
  human_gates:['EXTERNAL_MESSAGE','PRODUCTION_RELEASE']
});
if(mission.authority_envelope.max_action_level!=='EXECUTE_REVERSIBLE')fail('accepted charter expanded runtime ceiling');

for(const x of [
  {external:true},{irreversible:true},{protected_domain:true},{material_strategy_change:true}
]) if(routeDeviation({...x,severity:'NOTICE',reversible:true,known_repair:true})!=='FOUNDER_GATE') fail('protected deviation escaped founder gate');

const unknown=evaluateHomeostasis({desired_state:{healthy:true},observed_state:{},deviations:[]});
if(unknown.health_state!=='UNKNOWN')fail('missing observability declared healthy');

console.log(JSON.stringify({gate:'ank-pie-founder-mode-red-team',status:'PASS'},null,2));
