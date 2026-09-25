import {runReferenceGovernanceAudit} from "./audit-engine.mjs";
import {provisionReferenceTwin} from "./twin-engine.mjs";
import {validateFederationEnvelope,FederationValidationError,CONTRACT_VERSION} from "./validate.mjs";
import {signFederationEnvelope,verifyFederationSignature} from "./security.mjs";
function id(prefix="ank"){return prefix+"_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,10)}
function signingSecret(){return process.env.ANK_FEDERATION_SIGNING_SECRET||""}
export function signaturesRequired(){return process.env.ANK_FEDERATION_REQUIRE_SIGNATURES!=="false"}
export function authorised(request){const expected=process.env.ANK_FEDERATION_ACCESS_TOKEN;if(!expected)return false;return(request.headers?.authorization||"")===`Bearer ${expected}`}
export function apiEnabled(){return process.env.ANK_FEDERATION_API_ENABLED==="true"}
export function rejectMethod(request,response){if(request.method!=="POST"){response.setHeader("allow","POST");response.status(405).json({error:"METHOD_NOT_ALLOWED"});return true}return false}
export function rejectUnavailable(request,response){
 if(!apiEnabled()){response.status(503).json({error:"FEDERATION_API_DISABLED"});return true}
 if(!authorised(request)){response.status(401).json({error:"UNAUTHORISED"});return true}
 if(signaturesRequired()&&!signingSecret()){response.status(503).json({error:"FEDERATION_SIGNING_NOT_CONFIGURED"});return true}
 return false
}
function seenNonce(issuer,nonce,expiresAt){
 const g=globalThis;g.__ankFederationNonces=g.__ankFederationNonces||new Map();const m=g.__ankFederationNonces,now=Date.now();
 for(const[k,v]of m)if(v<now)m.delete(k);
 const key=issuer+":"+nonce;if(m.has(key))return true;m.set(key,Date.parse(expiresAt)||now+300000);return false
}
export function parseInbound(request,expectedType){
 const envelope=request.body;validateFederationEnvelope(envelope,{receivingProduct:"ANUNNAKI"});
 if(envelope.message_type!==expectedType)throw new FederationValidationError("WRONG_MESSAGE_TYPE",`Expected ${expectedType}`);
 if(signaturesRequired()||envelope.security){
  let verified;try{verified=verifyFederationSignature(envelope,{secret:signingSecret()})}catch(e){throw new FederationValidationError("SIGNATURE_REJECTED",e.message)}
  if(seenNonce(envelope.issuer.product,verified.nonce,verified.expires_at))throw new FederationValidationError("REPLAY_REJECTED","Federation nonce has already been used.");
 }
 return envelope
}
export function secureOutbound(envelope){
 validateFederationEnvelope(envelope);
 const secret=signingSecret();if(!secret){if(signaturesRequired())throw new FederationValidationError("FEDERATION_SIGNING_NOT_CONFIGURED","Signing is required.");return envelope}
 return signFederationEnvelope(envelope,{secret,keyId:process.env.ANK_FEDERATION_SIGNING_KEY_ID||"primary"})
}
function base(requestEnvelope,type,payload,dataClassification=requestEnvelope.data_classification){return{schema_version:"1.0",contract_version:CONTRACT_VERSION,message_id:id("msg"),correlation_id:requestEnvelope.correlation_id,issued_at:new Date().toISOString(),issuer:{product:"ANUNNAKI",instance:"anunnaki.live"},audience:requestEnvelope.issuer,message_type:type,authority:{requested_scope:requestEnvelope.authority.requested_scope,human_approval_required:true,export_permission:"RETURN_TO_REQUESTER_ONLY"},data_classification:dataClassification,payload}}
export function provisionalAuditResult(req){return base(req,"AI_AUDIT_RESULT",runReferenceGovernanceAudit(req))}
export function provisionalTwinResult(req){return base(req,"TWIN_RESULT",provisionReferenceTwin(req))}
export function teachingDecision(req){const p=req.payload,unsafe=p.scope==="NETWORK_CANDIDATE"&&(p.data_handling?.child_data===true||p.data_handling?.confidential_client_data===true||p.data_handling?.privileged_material===true||p.data_handling?.deidentified!==true);return base(req,"TEACHING_DECISION",{teaching_ref:id("teach"),decision:unsafe?"REJECT":"QUARANTINE",reason:unsafe?"NETWORK_EXPORT_VIOLATES_DATA_BOUNDARY":"TEACHING_REQUIRES_LOCAL_VERIFICATION_AND_EXPLICIT_ADMISSION",admitted_scope:"NONE",provenance:{source_refs:p.provenance?.source_refs||[],transformations:["teaching-admission"],created_at:new Date().toISOString()}},"INTERNAL")}
export function capabilities(){return{service:"ank-federation",contract:"ANK_FEDERATION_V1",contract_version:CONTRACT_VERSION,products:["ANUNNAKI","GC","MN"],operations:["AI_AUDIT_REQUEST","TWIN_REQUEST","TEACHING_OFFER"],security:{signatures_required:signaturesRequired(),algorithm:"HMAC-SHA256",replay_protection:"INSTANCE_LOCAL_REFERENCE_GATEWAY"},engines:{audit:"REFERENCE_GOVERNANCE_V1",twin:"REFERENCE_PROVISIONER_V1",substantive_audit_configured:Boolean(process.env.ANK_AUDIT_ENGINE_URL),durable_twin_registry_configured:Boolean(process.env.ANK_TWIN_ENGINE_URL)},teaching:{default:"QUARANTINE"}}}
export function sendError(response,error){const status=error instanceof FederationValidationError?422:500;response.status(status).json({error:error.code||"FEDERATION_INTERNAL_ERROR",message:error.message,details:error.details||[]})}
