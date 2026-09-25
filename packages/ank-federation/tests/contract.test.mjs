import assert from "node:assert/strict";
import { validateFederationEnvelope, admissionDecision } from "../src/validate.mjs";

const base={
 schema_version:"1.0",message_id:"msg_1",correlation_id:"cor_1",issued_at:"2026-09-25T07:34:00Z",
 issuer:{product:"GC",instance:"test"},audience:{product:"ANUNNAKI",instance:"anunnaki.live"},
 message_type:"TWIN_REQUEST",
 authority:{requested_scope:"CONTRACT_REVIEW",human_approval_required:true,export_permission:"RETURN_ONLY"},
 data_classification:"PROFESSIONAL_CONFIDENTIAL",
 payload:{human_professional_ref:"pro_1",profession:"commercial-law",jurisdictions:["ZA"],requested_capabilities:["contract_review"],requested_authority:"PREPARE_ONLY",subject_kind:"HUMAN_PROFESSIONAL"}
};
assert.equal(validateFederationEnvelope(base).ok,true);
assert.equal(admissionDecision({...base,audience:{product:"ANUNNAKI",instance:"x"}},"ANUNNAKI").decision,"VERIFY");
assert.throws(()=>validateFederationEnvelope({...base,payload:{...base.payload,human_professional_ref:null}}));

const unsafe={...base,message_type:"TEACHING_OFFER",payload:{
 direction:"GC_TO_ANUNNAKI",scope:"NETWORK_CANDIDATE",consent:{granted:true},
 data_handling:{deidentified:false,child_data:false,confidential_client_data:true,privileged_material:false,contains_secrets:false},
 lesson:{capability:"contract_review",observation:"x"},provenance:{source_refs:[]}
}};
assert.throws(()=>validateFederationEnvelope(unsafe));
console.log("ANK federation contract tests passed");
