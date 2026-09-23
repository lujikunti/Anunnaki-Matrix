import test from "node:test";
import assert from "node:assert/strict";
import { createPostgresLedger } from "../src/index.mjs";

test("postgres ledger only uses parameterised queries and private schema", async () => {
  const calls=[];
  const row={
    id:"11111111-1111-4111-8111-111111111111",idempotency_key:"idem-12345678",request_fingerprint:"fp",provider:"fake",
    provider_reference:null,merchant_transaction_id:null,amount_minor:"100",currency:"ZAR",reference:"ref",product_key:"p",
    subject_type:"family",subject_id:"f",status:"created",provider_code:null,metadata:{},status_verified_at:null,
    settlement_verified_at:null,created_at:"2026-09-23T00:00:00Z",updated_at:"2026-09-23T00:00:00Z"
  };
  const query=async(text,params)=>{
    calls.push({text,params});
    if(text.includes("claim_payment_intent")) return {rows:[{payment_id:row.id,replayed:false}]};
    if(text.includes("where id = $1::uuid")) return {rows:[row]};
    return {rows:[]};
  };
  const ledger=createPostgresLedger({query});
  const result=await ledger.claimPaymentIntent({
    idempotencyKey:"idem-12345678",requestFingerprint:"fp",provider:"fake",amountMinor:100,currency:"ZAR",reference:"ref",
    productKey:"p",subject:{type:"family",id:"f"},metadata:{}
  });
  assert.equal(result.payment.id,row.id);
  assert.equal(result.replayed,false);
  assert.ok(calls.every(c=>c.text.includes("ank_pay_sandbox")));
  assert.ok(calls.every(c=>!c.text.includes("idem-12345678")));
});
