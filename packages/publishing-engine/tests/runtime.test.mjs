import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authorizeAction,createReaderState,updateReaderState,readerProgress,
  normalizeCommerceReceipt,commerceEntitlementDecision,sanitizeAnalyticsEvent,
  buildRelationshipIndex,buildCommandCentre
} from '../src/index.mjs';

const release={content_complete:true,qa_complete:true,rights_cleared:true,security_cleared:true,accessibility_checked:true,release_approved:true,deployed:false,production_verified:false};
const mnContent={id:'mn1',product:'mn',content_type:'book',title:'MN',slug:'mn',version:'1',status:'COMPLETE',workflow_state:'RELEASE_APPROVED',rights_status:'CLEARED',provenance:{},release_status:release,asset_references:[],extensions:{mn:{}}};
const gcContent={...mnContent,id:'gc1',product:'gc',title:'GC',slug:'gc',extensions:{gc:{}}};

test('RBAC requires explicit household attribute match',()=>{
  const actor={product_roles:{mn:['educator']},household_ids:['h1'],learner_ids:['l1']};
  assert.equal(authorizeAction({actor,product:'mn',action:'WRITE_LEARNER_FEEDBACK',resource:{household_id:'h1',learner_id:'l1'}}).allowed,true);
  assert.equal(authorizeAction({actor,product:'mn',action:'WRITE_LEARNER_FEEDBACK',resource:{household_id:'h2',learner_id:'l1'}}).allowed,false);
});
test('normal product roles cannot perform publication administration',()=>{
  const actor={product_roles:{gc:['organization_admin']},organization_ids:['o1']};
  assert.equal(authorizeAction({actor,product:'gc',action:'PUBLISH',resource:{organization_id:'o1'}}).allowed,false);
});
test('reader state tracks resume, completion, bookmarks and accessible preferences',()=>{
  let state=createReaderState({publication_id:'b1',content_version:'1.0',total_units:4});
  state=updateReaderState(state,{type:'OPEN_UNIT',unit:3,at:'2026-09-21T00:00:00Z'});
  state=updateReaderState(state,{type:'COMPLETE_UNIT',unit:3});
  state=updateReaderState(state,{type:'BOOKMARK_UNIT',unit:3});
  state=updateReaderState(state,{type:'SET_TEXT_SCALE',value:1.3});
  assert.equal(state.current_unit,3); assert.deepEqual(state.bookmarks,[3]); assert.equal(state.text_scale,1.3);
  assert.deepEqual(readerProgress(state),{completed:1,total:4,ratio:.25,percent:25});
});
test('commerce receipt requires verified provider signature and never grants by itself',()=>{
  assert.throws(()=>normalizeCommerceReceipt({provider:'yoco',provider_event_id:'e1',provider_reference:'c1',amount_minor:100,currency:'ZAR',status:'paid',signature_verified:false}));
  const receipt=normalizeCommerceReceipt({provider:'yoco',provider_event_id:'e1',provider_reference:'c1',amount_minor:100,currency:'ZAR',status:'succeeded',signature_verified:true,product:'mn',product_code:'plus',subject_id:'u1',verified_at:'2026-09-21T00:00:00Z'});
  assert.equal(receipt.state,'PAID'); assert.equal(receipt.entitlement_transition,'NONE_PENDING_EXPLICIT_POLICY');
});
test('commerce entitlement grant requires explicit policy and is replay-safe',()=>{
  const receipt=normalizeCommerceReceipt({provider:'yoco',provider_event_id:'e1',provider_reference:'c1',amount_minor:100,currency:'ZAR',status:'paid',signature_verified:true,product:'gc',product_code:'seat',subject_id:'u1',verified_at:'2026-09-21T00:00:00Z'});
  assert.equal(commerceEntitlementDecision({receipt,policy:{auto_grant:false}}).grant,false);
  const policy={auto_grant:true,product:'gc',product_codes:['seat'],entitlement_code:'gc_library',duration_days:30};
  const first=commerceEntitlementDecision({receipt,policy,existing_entitlements:[]}); assert.equal(first.grant,true);
  const second=commerceEntitlementDecision({receipt,policy,existing_entitlements:[first.entitlement]}); assert.equal(second.grant,false); assert.equal(second.reason,'REPLAY_ALREADY_GRANTED');
});
test('analytics strips sensitive and child-identifying metadata',()=>{
  const event=sanitizeAnalyticsEvent({product:'mn',event_name:'search',resource_id:'library',metadata:{result_count:3,raw_search:'diagnosis',learner_id:'l1',email:'x@example.com'}});
  assert.deepEqual(event.metadata,{result_count:3});
});
test('relationship graph rejects orphan edges and product leakage',()=>{
  const graph=buildRelationshipIndex({product:'mn',nodes:[mnContent,gcContent],relationships:[{product:'mn',from:'mn1',to:'missing',type:'related'},{product:'gc',from:'gc1',to:'gc1',type:'related'}]});
  assert.equal(graph.nodes.length,1); assert.equal(graph.valid,false);
});
test('command centre exposes blocked assets and complete-not-deployed truth',()=>{
  const asset={asset_id:'a1',product:'mn',owner:'u',source:'x',acquisition_method:'upload',rights_classification:'RIGHTS_UNCLEAR',release_clearance:false};
  const command=buildCommandCentre({content:[mnContent,gcContent],assets:[asset],product:'mn',now:Date.parse('2026-09-21T00:00:00Z')});
  assert.deepEqual(command.assets.rights_blocked,['a1']);
  assert.deepEqual(command.operational.complete_not_deployed,['mn1']);
  assert.ok(command.operational.failed_release_gate.includes('mn1'));
});
