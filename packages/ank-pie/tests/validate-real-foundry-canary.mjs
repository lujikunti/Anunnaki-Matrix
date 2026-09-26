import fs from "node:fs";
const fail=m=>{throw new Error("Foundry real canary QA: "+m)};
const p="api/training/gc-foundry-canary.mjs";
const s=fs.readFileSync(new URL("../../../"+p,import.meta.url),"utf8");
for(const x of [
  'openai/gpt-5.6-sol',
  'getVercelOidcToken',
  'https://ai-gateway.vercel.sh/v1/chat/completions',
  'LEGAL_INTAKE_TRIAGE',
  'CANDIDATE_DECISION_SUPPORT',
  'Do not make a final legal determination',
  'Do not invent missing facts or evidence',
  'trust_credit_not_applied_here:true',
  's-maxage=86400'
]) if(!s.includes(x)) fail("missing "+x);
if(/API_KEY\s*=|sk-[A-Za-z0-9]/.test(s)) fail("static provider credential detected");
if((s.match(/title:"/g)||[]).length!==3) fail("expected exactly three unseen synthetic variants");
console.log("Foundry real canary QA passed");
