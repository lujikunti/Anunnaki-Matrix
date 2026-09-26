const ACTION_RANK={READ:0,RECOMMEND:1,DRAFT:2,EXECUTE_REVERSIBLE:3,EXECUTE_CONSEQUENTIAL:4};

export function rank(level){
  if(!(level in ACTION_RANK)) throw new Error('Unknown action level: '+level);
  return ACTION_RANK[level];
}

export function resolveAgentChart(protocol,agentId){
  const assignment=(protocol.agent_assignments||[]).find(x=>x.agent_id===agentId);
  if(!assignment) return null;
  const template=protocol.templates?.[assignment.template];
  if(!template) throw new Error('Unknown chart template '+assignment.template+' for '+agentId);
  return {
    ...template,
    ...assignment,
    planets:{
      sun:assignment.sun,
      moon:template.moon,
      ascendant:assignment.template,
      mercury:template.mercury,
      venus:'COLLABORATE_WITH_EXPLICIT_HANDOFFS_AND_CONFLICT_DISCLOSURE',
      mars:template.mars,
      jupiter:template.jupiter,
      saturn:template.saturn,
      uranus:'SANDBOX_ONLY_UNLESS_SEPARATELY_AUTHORIZED',
      neptune:template.neptune,
      pluto:template.pluto,
      north_node:'EARN_GREATER_AUTONOMY_ONLY_THROUGH_ANK_AGENT_APPRENTICESHIP_V1'
    }
  };
}

export function evaluateSource(source,{intent='REFERENCE',rightsVerified=false,applicabilityVerified=false}={}){
  if(!source) return {decision:'DENY',reason:'UNKNOWN_SOURCE'};
  const c=source.source_class;
  if(intent==='FULL_TEXT_INGEST'&&c==='LICENSED_METADATA_ONLY'&&!rightsVerified)
    return {decision:'DENY',reason:'LICENCE_OR_PERMISSION_REQUIRED'};
  if(intent==='CURRENT_AUTHORITY'&&(c==='WITHDRAWN_REFERENCE_ONLY'||c==='HISTORICAL_REFERENCE_ONLY'))
    return {decision:'DENY',reason:'NOT_CURRENT_AUTHORITY'};
  if(intent==='CURRENT_AUTHORITY'&&String(source.status||'').includes('WITHDRAWN'))
    return {decision:'DENY',reason:'WITHDRAWN'};
  if(intent==='CURRENT_BINDING_AUTHORITY'&&source.binding==='VERIFY_STATE_RATIFICATION_AND_APPLICABILITY'&&!applicabilityVerified)
    return {decision:'HUMAN_GATE',reason:'JURISDICTIONAL_APPLICABILITY_REQUIRED'};
  return {decision:'ALLOW',reason:'SOURCE_ADMITTED_FOR_REQUESTED_USE'};
}

export function effectiveCeiling(chart,conditions,activeTransits=[]){
  let ceiling=chart?.planets?.mars||chart?.mars;
  if(!ceiling) throw new Error('Chart Mars/action ceiling missing');
  for(const id of activeTransits){
    const t=(conditions?.transits||[]).find(x=>x.id===id);
    if(t&&rank(t.max_action_level)<rank(ceiling)) ceiling=t.max_action_level;
  }
  return ceiling;
}

export function evaluateAction({
  chart,
  constitution,
  conditions,
  requested_level,
  active_transits=[],
  human_approved=false,
  external=false,
  irreversible=false,
  material=true,
  proposer_agent_id=null,
  approver_agent_id=null,
  self_permission_change=false,
  self_trust_change=false,
  kill_switch_engaged=false
}){
  if(!chart) return {decision:'DENY',reason:'NO_AGENT_CHART'};
  if(kill_switch_engaged) return {decision:'DENY',reason:'KILL_SWITCH'};
  if(self_permission_change||self_trust_change)
    return {decision:'DENY',reason:'NO_AGENT_CAN_GRANT_ITSELF_MORE_AUTHORITY'};
  if(material&&proposer_agent_id&&approver_agent_id&&proposer_agent_id===approver_agent_id)
    return {decision:'DENY',reason:'SEPARATION_OF_DUTIES'};
  const ceiling=effectiveCeiling(chart,conditions,active_transits);
  if(rank(requested_level)>rank(ceiling))
    return {decision:'DENY',reason:'ABOVE_EFFECTIVE_MARS_CEILING',effective_ceiling:ceiling};
  const consequential=requested_level==='EXECUTE_CONSEQUENTIAL';
  if((consequential||external||irreversible)&&!human_approved)
    return {decision:'HUMAN_GATE',reason:'CONSEQUENTIAL_OR_EXTERNAL_ACTION_REQUIRES_HUMAN',effective_ceiling:ceiling};
  return {decision:'ALLOW',reason:'WITHIN_CHART_AND_CONSTITUTION',effective_ceiling:ceiling};
}

export function assertStandardsSpine(spine){
  if(spine.policy_id!=='ANK_PIE_STANDARDS_SPINE_V1') throw new Error('wrong standards spine');
  const ids=new Set((spine.sources||[]).map(x=>x.source_id));
  for(const required of [
    'AU_CONTINENTAL_AI_STRATEGY_2024','AU_DATA_POLICY_FRAMEWORK_2022','AU_MALABO_CONVENTION_2014',
    'ARSO_STRATEGIC_PLAN_2022_2027','SA_POPIA_2013','ISO_IEC_42001_2023',
    'NIST_AI_AGENT_STANDARDS_INITIATIVE_2026','OWASP_AGENT_CONTROL_STANDARD_2026','OWASP_AGENTIC_TOP10_2026'
  ]) if(!ids.has(required)) throw new Error('missing standards source '+required);
  if(!spine.authority_order?.[0]?.includes('BINDING_LAW')) throw new Error('binding law must lead authority order');
  return true;
}
