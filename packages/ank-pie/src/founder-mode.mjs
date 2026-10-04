export function buildProjectTwin(input={}){
  const required=['project_key','observed_intent','observed_reality','evidence'];
  for(const k of required) if(input[k]===undefined || input[k]===null || (Array.isArray(input[k])&&input[k].length===0)) throw new Error('project_twin_missing_'+k);
  const confidence=Number(input.confidence??0.5);
  if(!Number.isFinite(confidence)||confidence<0||confidence>1) throw new Error('project_twin_invalid_confidence');
  return {
    project_key:input.project_key,
    observed_intent:input.observed_intent,
    observed_reality:input.observed_reality,
    locked_decisions:input.locked_decisions||[],
    dependencies:input.dependencies||[],
    evidence:input.evidence,
    contradictions:input.contradictions||[],
    confidence,
    health_state:input.health_state||'UNKNOWN',
    last_observed_at:input.last_observed_at||null
  };
}

export function assessProjectTwin(twin={}){
  const contradictions=Array.isArray(twin.contradictions)?twin.contradictions:[];
  const dependencies=Array.isArray(twin.dependencies)?twin.dependencies:[];
  const critical=contradictions.some(x=>String(x.severity||'').toUpperCase()==='CRITICAL');
  const blocked=dependencies.some(x=>['BLOCKED','MISSING','FAILED'].includes(String(x.state||'').toUpperCase()));
  const confidence=Number(twin.confidence??0);
  return {
    needs_proposal:critical||blocked||contradictions.length>0||confidence<0.7,
    reason:critical?'CRITICAL_CONTRADICTION':blocked?'BLOCKED_DEPENDENCY':contradictions.length?'INTENT_DRIFT':confidence<0.7?'LOW_CONFIDENCE':'NOMINAL'
  };
}

const ORDER={READ:0,RECOMMEND:1,DRAFT:2,EXECUTE_REVERSIBLE:3,EXECUTE_CONSEQUENTIAL:4};

export function detectIntentContradictions({lockedDecisions=[],observedCommitments=[]}={}){
  const locked=new Map(lockedDecisions.map(x=>[x.key,x]));
  const contradictions=[];
  for(const observed of observedCommitments){
    const decision=locked.get(observed.key);
    if(!decision) continue;
    const desired=String(decision.state??decision.value??'').toUpperCase();
    const actual=String(observed.state??observed.value??'').toUpperCase();
    if(desired && actual && desired!==actual){
      contradictions.push({
        key:observed.key,
        locked_state:desired,
        observed_state:actual,
        severity:observed.severity||decision.severity||'IMPORTANT',
        evidence_refs:[...(decision.evidence_refs||[]),...(observed.evidence_refs||[])]
      });
    }
  }
  return contradictions;
}

export function buildFounderProposal(input={}){
  const required=['project_key','observed_goal','evidence','assumptions','recommended_course','definition_of_done'];
  for(const k of required) if(!input[k] || (Array.isArray(input[k])&&input[k].length===0)) throw new Error('founder_proposal_missing_'+k);
  return {
    proposal_id:input.proposal_id||null,
    state:'READY_FOR_FOUNDER',
    project_key:input.project_key,
    observed_goal:input.observed_goal,
    evidence:input.evidence,
    assumptions:input.assumptions,
    contradictions:input.contradictions||[],
    recommended_course:input.recommended_course,
    what_to_stop:input.what_to_stop||[],
    definition_of_done:input.definition_of_done,
    authority_requested:input.authority_requested||{max_action_level:'EXECUTE_REVERSIBLE'},
    founder_decisions_required:input.founder_decisions_required||[],
    created_at:input.created_at||null
  };
}

export function adoptMission({proposal,founder_decision,existing_authority={max_action_level:'DRAFT'},human_gates=[]}={}){
  if(!proposal || proposal.state!=='READY_FOR_FOUNDER') throw new Error('proposal_not_ready');
  if(!['ACCEPT','MODIFY'].includes(founder_decision?.decision)) throw new Error('founder_acceptance_required');
  const requested=proposal.authority_requested?.max_action_level||'DRAFT';
  const current=existing_authority.max_action_level||'DRAFT';
  const bounded=ORDER[requested] <= ORDER[current] ? requested : current;
  return {
    mission_id:founder_decision.mission_id||null,
    state:'AGREED',
    project_key:proposal.project_key,
    objective:founder_decision.objective||proposal.observed_goal,
    accepted_proposal_ref:proposal.proposal_id,
    definition_of_done:founder_decision.definition_of_done||proposal.definition_of_done,
    authority_envelope:{...proposal.authority_requested,max_action_level:bounded},
    human_gates:[...new Set([...(human_gates||[]),...(founder_decision.human_gates||[])])],
    evidence_requirements:founder_decision.evidence_requirements||['BUILD_RECEIPT','RED_TEAM_RECEIPT','INDEPENDENT_VERIFICATION'],
    rollback_or_recovery:founder_decision.rollback_or_recovery||'REQUIRED_FOR_PRODUCTION_IMPACT',
    homeostasis_contract:founder_decision.homeostasis_contract||{required:true,health_states:['NOMINAL','DEGRADED','CRITICAL','UNKNOWN']}
  };
}

export function routeDeviation({
  severity='NOTICE',
  reversible=true,
  known_repair=true,
  protected_domain=false,
  external=false,
  irreversible=false,
  material_strategy_change=false
}={}){
  const s=String(severity).toUpperCase();
  if(protected_domain||external||irreversible||material_strategy_change||s==='CRITICAL') return 'FOUNDER_GATE';
  if(!known_repair) return 'SPECIALIST_REVIEW';
  if(reversible && ['INFO','NOTICE','IMPORTANT'].includes(s)) return 'AUTO_REPAIR';
  return 'SPECIALIST_REVIEW';
}

export function evaluateHomeostasis({desired_state={},observed_state={},deviations=[]}={}){
  const routed=deviations.map(d=>({...d,route:routeDeviation(d)}));
  const founder=routed.filter(x=>x.route==='FOUNDER_GATE');
  const unknown=routed.filter(x=>x.route==='SPECIALIST_REVIEW');
  const auto=routed.filter(x=>x.route==='AUTO_REPAIR');
  let health='NOMINAL';
  if(founder.length) health='CRITICAL';
  else if(unknown.length||auto.length) health='DEGRADED';
  if(!observed_state || Object.keys(observed_state).length===0) health='UNKNOWN';
  return {health_state:health,desired_state,observed_state,deviations:routed,founder_exceptions:founder,repair_queue:auto,specialist_queue:unknown};
}
