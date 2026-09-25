import { validateFederationEnvelope, FederationValidationError } from "./validate.mjs";

function id(prefix="ank") {
  return prefix+"_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,10);
}

export function authorised(request) {
  const expected=process.env.ANK_FEDERATION_ACCESS_TOKEN;
  if(!expected) return false;
  return (request.headers?.authorization||"")===`Bearer ${expected}`;
}

export function apiEnabled() {
  return process.env.ANK_FEDERATION_API_ENABLED==="true";
}

export function rejectMethod(request,response) {
  if(request.method!=="POST"){ response.setHeader("allow","POST"); response.status(405).json({error:"METHOD_NOT_ALLOWED"}); return true; }
  return false;
}

export function rejectUnavailable(request,response) {
  if(!apiEnabled()){ response.status(503).json({error:"FEDERATION_API_DISABLED"}); return true; }
  if(!authorised(request)){ response.status(401).json({error:"UNAUTHORISED"}); return true; }
  return false;
}

export function parseInbound(request, expectedType) {
  const envelope=request.body;
  validateFederationEnvelope(envelope,{receivingProduct:"ANUNNAKI"});
  if(envelope.message_type!==expectedType) throw new FederationValidationError("WRONG_MESSAGE_TYPE",`Expected ${expectedType}`);
  return envelope;
}

export function provisionalAuditResult(requestEnvelope) {
  return {
    schema_version:"1.0",
    message_id:id("msg"),
    correlation_id:requestEnvelope.correlation_id,
    issued_at:new Date().toISOString(),
    issuer:{product:"ANUNNAKI",instance:"anunnaki.live"},
    audience:requestEnvelope.issuer,
    message_type:"AI_AUDIT_RESULT",
    authority:{requested_scope:requestEnvelope.authority.requested_scope,human_approval_required:true,export_permission:"RETURN_TO_REQUESTER_ONLY"},
    data_classification:requestEnvelope.data_classification,
    payload:{
      audit_id:id("audit"),
      status:"ACCEPTED_FOR_PROCESSING",
      findings:[],
      provenance:{source_refs:requestEnvelope.payload.corpus_refs||[],transformations:["federation-contract-validation"],created_at:new Date().toISOString()},
      limitations:["Federation gateway accepted the request; production AI Audit execution is delegated to the configured Anunnaki audit engine."],
      processing:{state:"QUEUED",engine_configured:Boolean(process.env.ANK_AUDIT_ENGINE_URL)}
    }
  };
}

export function provisionalTwinResult(requestEnvelope) {
  return {
    schema_version:"1.0",
    message_id:id("msg"),
    correlation_id:requestEnvelope.correlation_id,
    issued_at:new Date().toISOString(),
    issuer:{product:"ANUNNAKI",instance:"anunnaki.live"},
    audience:requestEnvelope.issuer,
    message_type:"TWIN_RESULT",
    authority:{requested_scope:requestEnvelope.authority.requested_scope,human_approval_required:true,export_permission:"RETURN_TO_REQUESTER_ONLY"},
    data_classification:requestEnvelope.data_classification,
    payload:{
      twin_ref:id("twin_pending"),
      human_professional_ref:requestEnvelope.payload.human_professional_ref,
      profession:requestEnvelope.payload.profession,
      capabilities:[],
      authority_ceiling:"UNVERIFIED_PENDING_PROFESSIONAL_BINDING",
      mastery_claims:[],
      provenance:{source_refs:[],transformations:["federation-contract-validation"],created_at:new Date().toISOString()},
      processing:{state:"PENDING_BINDING",engine_configured:Boolean(process.env.ANK_TWIN_ENGINE_URL)}
    }
  };
}

export function teachingDecision(requestEnvelope) {
  const p=requestEnvelope.payload;
  const unsafe=p.scope==="NETWORK_CANDIDATE" && (
    p.data_handling?.child_data===true ||
    p.data_handling?.confidential_client_data===true ||
    p.data_handling?.privileged_material===true ||
    p.data_handling?.deidentified!==true
  );
  return {
    schema_version:"1.0",
    message_id:id("msg"),
    correlation_id:requestEnvelope.correlation_id,
    issued_at:new Date().toISOString(),
    issuer:{product:"ANUNNAKI",instance:"anunnaki.live"},
    audience:requestEnvelope.issuer,
    message_type:"TEACHING_DECISION",
    authority:{requested_scope:"LEARNING_CANDIDATE",human_approval_required:true,export_permission:"NONE"},
    data_classification:"INTERNAL",
    payload:{
      teaching_ref:id("teach"),
      decision:unsafe?"REJECT":"QUARANTINE",
      reason:unsafe?"NETWORK_EXPORT_VIOLATES_DATA_BOUNDARY":"TEACHING_REQUIRES_LOCAL_VERIFICATION_AND_EXPLICIT_ADMISSION",
      admitted_scope:"NONE",
      provenance:{source_refs:p.provenance?.source_refs||[],transformations:["federation-teaching-admission"],created_at:new Date().toISOString()}
    }
  };
}

export function sendError(response,error){
  const status=error instanceof FederationValidationError?422:500;
  response.status(status).json({error:error.code||"FEDERATION_INTERNAL_ERROR",message:error.message,details:error.details||[]});
}
