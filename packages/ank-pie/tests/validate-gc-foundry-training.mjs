import fs from 'node:fs';
const fail=m=>{throw new Error('GC Foundry PIE training QA: '+m)};
const m=JSON.parse(fs.readFileSync(new URL('../training/gc-foundry-v1.json',import.meta.url),'utf8'));
if(m.policy_id!=='ANK_PIE_GC_FOUNDRY_TRAINING_V1')fail('wrong policy');
if(m.trust_authority!=='ANK_AGENT_APPRENTICESHIP_V1')fail('PIE apprenticeship not sole trust authority');
if(m.model_weight_training!==false)fail('must not claim model-weight training');
if(m.status!=='CURRICULUM_LOADED_SHADOW_ONLY')fail('Foundry curriculum must begin shadow-only');
if((m.capabilities||[]).length!==18)fail('Foundry capability coverage must be 18');
if(new Set(m.capabilities.map(x=>x.capability_id)).size!==18)fail('duplicate capability ids');
for(const c of m.capabilities){
 if(c.training_state!=='SHADOW')fail(c.capability_id+' not SHADOW');
 if(c.semantic_ceiling!=='CANDIDATE_DECISION_SUPPORT')fail(c.capability_id+' semantic ceiling drift');
 if(c.professional_review_required!==true||c.human_release_required!==true)fail(c.capability_id+' human boundary weakened');
 if(!Array.isArray(c.agent_refs)||!c.agent_refs.length)fail(c.capability_id+' has no existing agent mapping');
}
for(const x of ['raw legacy source text','quarantined Foundry semantic extractions','semantic extractions whose source-rights/provenance link is incomplete'])if(!m.sources.excluded_until_admitted.includes(x))fail('missing source exclusion '+x);
for(const x of ['PROFESSIONAL_JUDGMENT_IS_HUMAN_RESERVED','UNKNOWN_OR_MISSING_EVIDENCE_REMAINS_UNKNOWN','PROVENANCE_SURVIVES_OUTPUT_GENERATION'])if(!m.global_invariants.includes(x))fail('missing invariant '+x);
if(JSON.stringify(m).includes('AUTONOMOUS_READY'))fail('curriculum must not self-graduate');
console.log('GC Foundry PIE training QA passed');
