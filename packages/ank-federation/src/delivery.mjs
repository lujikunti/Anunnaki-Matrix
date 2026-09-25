import {buildEnvelope} from "./validate.mjs";
import {signFederationEnvelope} from "./security.mjs";
import {pairAccessToken,pairSigningSecret} from "./service.mjs";
const DEST={GC:"https://the-general-counsel.vercel.app",MN:"https://michael-noah.vercel.app"};
const id=p=>p+"_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,10);
export async function deliverTeachingCandidate(target,lesson,{fetchImpl=fetch}={}){
 if(!DEST[target])throw new Error("UNSUPPORTED_TARGET");
 if(!lesson||typeof lesson!=="object")throw new Error("LESSON_REQUIRED");
 const secret=pairSigningSecret(target),token=pairAccessToken(target);if(!secret||!token)throw new Error("PAIR_CREDENTIALS_NOT_CONFIGURED");
 const env=buildEnvelope({issuer:{product:"ANUNNAKI",instance:"anunnaki.live"},audience:{product:target,instance:target.toLowerCase()},messageType:"TEACHING_OFFER",messageId:id("msg"),correlationId:id("cor"),authority:{requested_scope:"LEARNING_CANDIDATE",human_approval_required:true,export_permission:"TEACHING_CANDIDATE_ONLY"},dataClassification:"INTERNAL",payload:{direction:"ANUNNAKI_TO_"+target,scope:"THIS_PRODUCT",consent:{granted:true},data_handling:{deidentified:true,child_data:false,confidential_client_data:false,privileged_material:false,contains_secrets:false},lesson,provenance:{source_refs:[],created_at:new Date().toISOString(),origin:"ANUNNAKI"}}});
 const signed=signFederationEnvelope(env,{secret,keyId:process.env["ANK_FEDERATION_"+target+"_SIGNING_KEY_ID"]||"primary"});
 const r=await fetchImpl(DEST[target]+"/api/ank-federation-inbound",{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer "+token},body:JSON.stringify(signed)});
 const body=await r.json().catch(()=>({error:"INVALID_CALLBACK_JSON"}));if(!r.ok)throw Object.assign(new Error(body.message||body.error||"CALLBACK_FAILED"),{code:body.error||"CALLBACK_FAILED",details:body});
 return body;
}
