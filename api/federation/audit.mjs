import { parseInbound, provisionalAuditResult, rejectMethod, rejectUnavailable, sendError } from "../../packages/ank-federation/src/service.mjs";
export default async function handler(request,response){
 response.setHeader("cache-control","no-store");
 if(rejectMethod(request,response)||rejectUnavailable(request,response)) return;
 try{ const env=parseInbound(request,"AI_AUDIT_REQUEST"); return response.status(202).json(provisionalAuditResult(env)); }
 catch(error){ return sendError(response,error); }
}
