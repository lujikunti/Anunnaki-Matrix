import assert from "node:assert/strict";
import {validateFederationEnvelope,admissionDecision,CONTRACT_VERSION} from "../src/validate.mjs";
import {signFederationEnvelope,verifyFederationSignature} from "../src/security.mjs";
import {runReferenceGovernanceAudit} from "../src/audit-engine.mjs";
import {provisionReferenceTwin} from "../src/twin-engine.mjs";
import {parseInbound} from "../src/service.mjs";

const base={schema_version:"1.0",contract_version:CONTRACT_VERSION,message_id:"msg_1",correlation_id:"cor_1",issued_at:new Date().toISOString(),issuer:{product:"GC",instance:"test"},audience:{product:"ANUNNAKI",instance:"anunnaki.live"},message_type:"TWIN_REQUEST",authority:{requested_scope:"CONTRACT_REVIEW",human_approval_required:true,export_permission:"RETURN_ONLY"},data_classification:"PROFESSIONAL_CONFIDENTIAL",payload:{human_professional_ref:"pro_1",profession:"commercial-legal",jurisdictions:["ZA"],requested_capabilities:["contract_review"],requested_authority:"PREPARE_ONLY",subject_kind:"HUMAN_PROFESSIONAL"}};
assert.equal(validateFederationEnvelope(base).ok,true);
assert.equal(admissionDecision(base,"ANUNNAKI").decision,"VERIFY");
assert.throws(()=>validateFederationEnvelope({...base,contract_version:"1900-01-01"}));
assert.throws(()=>validateFederationEnvelope({...base,payload:{...base.payload,human_professional_ref:null}}));
assert.throws(()=>validateFederationEnvelope({...base,payload:{...base.payload,learner_ref:"learner_1"}}));

const unsafe={...base,message_type:"TEACHING_OFFER",payload:{direction:"GC_TO_ANUNNAKI",scope:"NETWORK_CANDIDATE",consent:{granted:true},data_handling:{deidentified:false,child_data:true,confidential_client_data:false,privileged_material:false,contains_secrets:false},lesson:{kind:"bad"},provenance:{source_refs:[]}}};
assert.throws(()=>validateFederationEnvelope(unsafe));

const secret="redteam-secret";
const signed=signFederationEnvelope(base,{secret,keyId:"rt"});
assert.equal(verifyFederationSignature(signed,{secret}).ok,true);
assert.throws(()=>verifyFederationSignature({...signed,payload:{...signed.payload,profession:"tampered"}},{secret}));
const expired=signFederationEnvelope({...base,issued_at:new Date(Date.now()-600000).toISOString()},{secret,keyId:"rt",ttlSeconds:1,now:Date.now()-600000});
assert.throws(()=>verifyFederationSignature(expired,{secret}));

process.env.ANK_FEDERATION_SIGNING_SECRET=secret;
process.env.ANK_FEDERATION_REQUIRE_SIGNATURES="true";
const replay=signFederationEnvelope({...base,message_id:"msg_replay",correlation_id:"cor_replay"},{secret,keyId:"rt"});
assert.equal(parseInbound({body:replay},"TWIN_REQUEST").message_id,"msg_replay");
assert.throws(()=>parseInbound({body:replay},"TWIN_REQUEST"),/nonce has already been used/i);

const auditReq={...base,message_type:"AI_AUDIT_REQUEST",payload:{audit_type:"GC_CONTROL",scope:{product:"GC"},question:"audit",corpus_refs:[],materiality:"HIGH",output_requirements:{findings:true}}};
const audit=runReferenceGovernanceAudit(auditReq);
assert.equal(audit.status,"REFERENCE_GOVERNANCE_AUDIT_COMPLETE");
assert.ok(audit.findings.some(x=>x.code==="CORPUS_NOT_SUPPLIED"));
assert.ok(audit.limitations.some(x=>/does not replace/i.test(x)));

const twin=provisionReferenceTwin(base);
assert.equal(twin.human_professional_ref,"pro_1");
assert.equal(twin.authority_ceiling,"OBSERVE_ONLY_UNTIL_MASTERY_AND_LOCAL_GRANT");
assert.equal(twin.processing.state,"PENDING_MASTERY");
console.log("ANK federation v2 red-team passed");
