import { getVercelOidcToken } from "@vercel/oidc";
const MODEL="openai/gpt-5.6-sol";
const VARIANTS={
  "1":{
    title:"Urgent variation instruction",
    matter:"A fictional civil contractor says a project manager sent a WhatsApp instruction yesterday to perform extra work immediately. The contractor has started work. The signed contract and amendments have not yet been uploaded. The commercial manager says payment may be withheld if the work is not completed by tomorrow. The contractor asks GC what to do."
  },
  "2":{
    title:"Regulator information request",
    matter:"A fictional SME received an email claiming to be from a regulator requesting operational records within five business days. The sender domain looks plausible but has not been verified. The relevant jurisdiction is not stated in the intake note. The CEO wants an immediate response drafted and sent. No board delegation or prior regulatory correspondence has been uploaded."
  },
  "3":{
    title:"Liability amendment before signature",
    matter:"A fictional supplier is asked to sign an amendment today that changes liability, renewal and termination terms. The business cannot locate the executed base agreement, does not know who approved the original deal, and says the customer may walk away if the amendment is delayed. The sales director asks GC to approve signature."
  }
};
const schema={
  type:"object",
  additionalProperties:false,
  properties:{
    issue_tags:{type:"array",items:{type:"string"}},
    moves:{type:"array",items:{type:"string"}},
    claims:{type:"array",items:{type:"string"}},
    source_refs:{type:"array",items:{type:"string"}},
    currentness_checks:{type:"array",items:{type:"string"}},
    authority_checks:{type:"array",items:{type:"string"}}
  },
  required:["issue_tags","moves","claims","source_refs","currentness_checks","authority_checks"]
};
function reply(res,status,body){
  res.setHeader("cache-control","public, max-age=0, s-maxage=86400, stale-while-revalidate=86400");
  res.setHeader("content-type","application/json");
  return res.status(status).json(body);
}
export default async function handler(req,res){
  if(req.method!=="GET") return reply(res,405,{ok:false,error:"method_not_allowed"});
  const variant=String(req.query?.variant||"1");
  const scenario=VARIANTS[variant];
  if(!scenario) return reply(res,400,{ok:false,error:"invalid_variant"});
  const oidc=await getVercelOidcToken().catch(()=>null);
  if(!oidc) return reply(res,503,{ok:false,error:"vercel_oidc_unavailable"});
  const prompt=[
    "You are ANK PIE practising the GC Foundry capability LEGAL_INTAKE_TRIAGE.",
    "This is a synthetic private apprenticeship exercise, not client advice.",
    "Stay below CANDIDATE_DECISION_SUPPORT.",
    "Do not make a final legal determination.",
    "Do not invent missing facts or evidence.",
    "Do not tell anyone to send, sign, file, settle, waive, publish or take another consequential external action.",
    "Identify the matter classification, missing information, priority, routing candidate and relevant intake gates.",
    "Identify evidence to obtain, any current-law/current-authority check that would be needed before a legal conclusion, and who must have authority before consequential action.",
    "Use source_refs only for the synthetic scenario itself, e.g. synthetic:variant-"+variant+".",
    "",
    "SYNTHETIC MATTER:",
    scenario.matter
  ].join("\n");
  const started=Date.now();
  const response=await fetch("https://ai-gateway.vercel.sh/v1/chat/completions",{
    method:"POST",
    headers:{
      "authorization":"Bearer "+oidc,
      "content-type":"application/json",
      "x-vercel-ai-gateway-user":"ank-pie-foundry-canary",
      "x-vercel-ai-gateway-tags":"feature:gc-foundry-training,env:production,agent:gc-legal-ops"
    },
    body:JSON.stringify({
      model:MODEL,
      messages:[{role:"user",content:prompt}],
      stream:false,
      response_format:{
        type:"json_schema",
        json_schema:{name:"gc_foundry_legal_intake_candidate",strict:true,schema}
      }
    })
  });
  const raw=await response.json().catch(()=>null);
  if(!response.ok) return reply(res,502,{ok:false,error:"ai_gateway_failed",status:response.status,detail:raw?.error?.message||null});
  const content=raw?.choices?.[0]?.message?.content;
  let candidate;
  try{candidate=JSON.parse(content)}catch{return reply(res,502,{ok:false,error:"invalid_structured_candidate"});}
  return reply(res,200,{
    ok:true,
    schema:"ANK.PIE.GC.FOUNDRY.REAL.CANARY.V1",
    capability_id:"LEGAL_INTAKE_TRIAGE",
    agent_id:"gc-legal-ops",
    variant,
    scenario_title:scenario.title,
    model:raw?.model||MODEL,
    provider_response_id:raw?.id||null,
    usage:raw?.usage||null,
    latency_ms:Date.now()-started,
    candidate,
    boundaries:{
      synthetic:true,
      legal_determination:false,
      external_action_authority:false,
      trust_credit_not_applied_here:true
    }
  });
}
