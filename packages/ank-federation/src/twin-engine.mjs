import {createHash} from "node:crypto";
const ref=(human,profession)=>"twin_"+createHash("sha256").update(human+"|"+profession).digest("hex").slice(0,28);
export function provisionReferenceTwin(requestEnvelope){
 const p=requestEnvelope.payload||{};
 return{twin_ref:ref(p.human_professional_ref,p.profession),human_professional_ref:p.human_professional_ref,profession:p.profession,jurisdictions:p.jurisdictions||[],capabilities:(p.requested_capabilities||[]).map(capability=>({capability,state:"UNASSESSED"})),authority_ceiling:"OBSERVE_ONLY_UNTIL_MASTERY_AND_LOCAL_GRANT",mastery_claims:[],provenance:{source_refs:[],transformations:["human-professional-binding","stable-twin-reference","capability-unassessed"],created_at:new Date().toISOString(),engine:"ANK_REFERENCE_TWIN_PROVISIONER_V1"},processing:{state:"PENDING_MASTERY",mastery_provider:"MN_TWIN_MASTERY_SCHOOL",persistence:"REQUESTER_LEDGER_ONLY"}};
}