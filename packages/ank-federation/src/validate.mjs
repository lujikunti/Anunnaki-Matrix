export const CONTRACT_VERSION="2026-09-25.2";
const PRODUCTS=new Set(["ANUNNAKI","GC","MN"]);
const TYPES=new Set(["AI_AUDIT_REQUEST","AI_AUDIT_RESULT","TWIN_REQUEST","TWIN_RESULT","TEACHING_OFFER","TEACHING_DECISION","ERROR"]);
const CLASSES=new Set(["PUBLIC","INTERNAL","CONFIDENTIAL","PROFESSIONAL_CONFIDENTIAL","CHILD_PROTECTED"]);
const DECISIONS=new Set(["REJECT","QUARANTINE","VERIFY","ADMIT"]);
export class FederationValidationError extends Error{constructor(code,message,details=[]){super(message);this.name="FederationValidationError";this.code=code;this.details=details}}
const obj=v=>v&&typeof v==="object"&&!Array.isArray(v);
const req=(o,k,e)=>{if(!obj(o)||o[k]===undefined||o[k]===null||o[k]==="")e.push("missing:"+k)};
export function validateFederationEnvelope(envelope,{receivingProduct=null}={}){
 const errors=[]; if(!obj(envelope))throw new FederationValidationError("INVALID_ENVELOPE","Envelope must be an object");
 for(const k of ["schema_version","contract_version","message_id","correlation_id","issued_at","issuer","audience","message_type","authority","data_classification","payload"])req(envelope,k,errors);
 if(envelope.schema_version!=="1.0")errors.push("unsupported:schema_version");
 if(envelope.contract_version!==CONTRACT_VERSION)errors.push("unsupported:contract_version");
 if(!PRODUCTS.has(envelope.issuer?.product))errors.push("invalid:issuer.product");
 if(!PRODUCTS.has(envelope.audience?.product))errors.push("invalid:audience.product");
 if(receivingProduct&&envelope.audience?.product!==receivingProduct)errors.push("wrong:audience.product");
 if(!TYPES.has(envelope.message_type))errors.push("invalid:message_type");
 if(!CLASSES.has(envelope.data_classification))errors.push("invalid:data_classification");
 for(const k of ["requested_scope","human_approval_required","export_permission"])req(envelope.authority,k,errors);
 const p=envelope.payload||{}, type=envelope.message_type;
 const required={
  AI_AUDIT_REQUEST:["audit_type","scope","question","corpus_refs","materiality","output_requirements"],
  AI_AUDIT_RESULT:["audit_id","status","findings","provenance","limitations"],
  TWIN_REQUEST:["human_professional_ref","profession","jurisdictions","requested_capabilities","requested_authority"],
  TWIN_RESULT:["twin_ref","human_professional_ref","profession","capabilities","authority_ceiling","mastery_claims","provenance"],
  TEACHING_OFFER:["direction","scope","consent","data_handling","lesson","provenance"],
  TEACHING_DECISION:["teaching_ref","decision","reason","admitted_scope","provenance"],
  ERROR:["code","message"]
 }[type]||[];
 for(const k of required)req(p,k,errors);
 if(type==="TWIN_REQUEST"||type==="TWIN_RESULT"){
  if(!p.human_professional_ref)errors.push("twin:human_professional_required");
  if(p.subject_kind&&p.subject_kind!=="HUMAN_PROFESSIONAL")errors.push("twin:subject_must_be_human_professional");
  if(p.learner_ref)errors.push("twin:learner_ref_prohibited");
 }
 if(type==="TEACHING_OFFER"){
  if(!["THIS_TWIN","THIS_ORGANISATION","THIS_PRODUCT","NETWORK_CANDIDATE"].includes(p.scope))errors.push("teaching:invalid_scope");
  if(p.consent?.granted!==true)errors.push("teaching:explicit_consent_required");
  if(p.data_handling?.contains_secrets===true)errors.push("teaching:secrets_prohibited");
  if(p.scope==="NETWORK_CANDIDATE"&&(p.data_handling?.child_data===true||p.data_handling?.confidential_client_data===true||p.data_handling?.privileged_material===true||p.data_handling?.deidentified!==true))errors.push("teaching:network_export_not_safe");
 }
 if(type==="TEACHING_DECISION"&&!DECISIONS.has(p.decision))errors.push("teaching:invalid_decision");
 if(envelope.security){
  for(const k of ["key_id","nonce","expires_at","signature_algorithm","signature"])req(envelope.security,k,errors);
  if(envelope.security.signature_algorithm!=="HMAC-SHA256")errors.push("security:unsupported_algorithm");
 }
 if(errors.length)throw new FederationValidationError("CONTRACT_REJECTED","Federation envelope failed contract validation",errors);
 return{ok:true,contract_version:CONTRACT_VERSION};
}
export function admissionDecision(envelope,receivingProduct){
 validateFederationEnvelope(envelope,{receivingProduct});
 if(envelope.message_type==="ERROR")return{decision:"REJECT",reason:"remote_error"};
 if(envelope.message_type==="TEACHING_OFFER")return{decision:"QUARANTINE",reason:"teaching_requires_local_verification"};
 if(envelope.data_classification==="CHILD_PROTECTED"&&receivingProduct!=="MN")return{decision:"REJECT",reason:"child_protected_boundary"};
 return{decision:"VERIFY",reason:"valid_external_input_requires_local_admission"};
}
export function buildEnvelope({issuer,audience,messageType,payload,authority,dataClassification="INTERNAL",messageId,correlationId,issuedAt}){
 const env={schema_version:"1.0",contract_version:CONTRACT_VERSION,message_id:messageId,correlation_id:correlationId,issued_at:issuedAt||new Date().toISOString(),issuer,audience,message_type:messageType,authority,data_classification:dataClassification,payload};
 validateFederationEnvelope(env); return env;
}
