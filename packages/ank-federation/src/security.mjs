import {createHmac,createHash,randomBytes,timingSafeEqual} from "node:crypto";
function canonical(v){if(Array.isArray(v))return"["+v.map(canonical).join(",")+"]";if(v&&typeof v==="object")return"{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+canonical(v[k])).join(",")+"}";return JSON.stringify(v)}
function unsigned(envelope){const copy=structuredClone(envelope);if(copy.security)delete copy.security.signature;return copy}
export function envelopeHash(envelope){return createHash("sha256").update(canonical(unsigned(envelope))).digest("hex")}
export function signFederationEnvelope(envelope,{secret,keyId="primary",ttlSeconds=300,nonce=null,now=Date.now()}={}){
 if(!secret)throw new Error("SIGNING_SECRET_REQUIRED");
 const signed=structuredClone(envelope);
 signed.security={key_id:keyId,nonce:nonce||randomBytes(18).toString("base64url"),expires_at:new Date(now+ttlSeconds*1000).toISOString(),signature_algorithm:"HMAC-SHA256"};
 signed.security.signature=createHmac("sha256",secret).update(canonical(unsigned(signed))).digest("hex");
 return signed;
}
export function verifyFederationSignature(envelope,{secret,now=Date.now(),clockSkewSeconds=30}={}){
 if(!secret)throw new Error("SIGNING_SECRET_REQUIRED");
 const s=envelope?.security;if(!s)throw new Error("SIGNATURE_REQUIRED");
 const exp=Date.parse(s.expires_at);if(!Number.isFinite(exp)||exp+clockSkewSeconds*1000<now)throw new Error("SIGNATURE_EXPIRED");
 const issued=Date.parse(envelope.issued_at);if(!Number.isFinite(issued)||issued-clockSkewSeconds*1000>now)throw new Error("ISSUED_AT_IN_FUTURE");
 const expected=createHmac("sha256",secret).update(canonical(unsigned(envelope))).digest("hex");
 const a=Buffer.from(String(s.signature||""),"utf8"),b=Buffer.from(expected,"utf8");
 if(a.length!==b.length||!timingSafeEqual(a,b))throw new Error("SIGNATURE_INVALID");
 return{ok:true,key_id:s.key_id,nonce:s.nonce,expires_at:s.expires_at,digest:expected};
}
