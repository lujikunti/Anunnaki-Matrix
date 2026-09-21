import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateContent,validateAsset,publicationGate,normaliseLegacyRecord,canAccess,searchContent,
  validateVersionChains,buildReleaseManifest,summarizeReleaseTruth,makeAuditEvent
} from '../src/index.mjs';

const releaseOn={content_complete:true,qa_complete:true,rights_cleared:true,security_cleared:true,accessibility_checked:true,release_approved:true,deployed:true,production_verified:true};
const releaseOff={content_complete:false,qa_complete:false,rights_cleared:false,security_cleared:false,accessibility_checked:false,release_approved:false,deployed:false,production_verified:false};
const base={id:'x',product:'mn',content_type:'book',title:'Book',slug:'book',version:'1.0.0',status:'BETA',workflow_state:'RELEASE_APPROVED',rights_status:'CLEARED',provenance:{source:'test'},release_status:releaseOn,asset_references:[],extensions:{mn:{grade:4}},entitlement_policy:{mode:'FREE'}};

test('rejects cross-product extension leakage',()=>{
  const result=validateContent({...base,extensions:{mn:{grade:4},gc:{jurisdiction:'ZA'}}});
  assert.equal(result.valid,false);
  assert.ok(result.errors.some(x=>x.includes('cross-product')));
});
test('legacy import fails closed',()=>{
  const item=normaliseLegacyRecord({product:'gc',source_file:'legacy.json',id:'g1',title:'Legacy',content_type:'article'});
  assert.equal(item.rights_status,'RIGHTS_UNCLEAR');
  assert.equal(item.release_status.release_approved,false);
});
test('restricted asset blocks publication',()=>{
  const asset={asset_id:'a1',product:'mn',owner:'x',source:'file',acquisition_method:'import',rights_classification:'RIGHTS_UNCLEAR',release_clearance:false};
  assert.equal(validateAsset(asset).valid,true);
  const gate=publicationGate({...base,asset_references:['a1']},new Map([['a1',asset]]));
  assert.equal(gate.allowed,false);
});
test('search cannot leak cross-product content',()=>{
  const gc={...base,id:'gc',product:'gc',content_type:'book',extensions:{gc:{jurisdiction:'ZA'}},title:'Confidential GC'};
  const mn={...base,id:'mn',title:'Maths'};
  const results=searchContent({items:[gc,mn],product:'mn',query:'',actor:{},entitlements:[]});
  assert.deepEqual(results.map(x=>x.id),['mn']);
});
test('unverified content is not searchable by normal user',()=>{
  const hidden={...base,id:'hidden',release_status:releaseOff,title:'Hidden'};
  const results=searchContent({items:[hidden],product:'mn',query:'Hidden',actor:{},entitlements:[]});
  assert.equal(results.length,0);
});
test('admin preview requires product/admin authority',()=>{
  const hidden={...base,id:'hidden',release_status:releaseOff};
  assert.equal(canAccess({actor:{roles:['ank_admin']},content:hidden,preview:true}).allowed,true);
  assert.equal(canAccess({actor:{},content:hidden,preview:true}).allowed,false);
});
test('family entitlement requires explicit household relationship',()=>{
  const family={...base,entitlement_policy:{mode:'FAMILY',household_ids:['h1']}};
  assert.equal(canAccess({actor:{id:'u1',household_ids:['h1']},content:family}).allowed,true);
  assert.equal(canAccess({actor:{id:'u2',household_ids:['h2']},content:family}).allowed,false);
});
test('paid content requires matching active entitlement',()=>{
  const paid={...base,entitlement_policy:{mode:'PAID'}};
  const ent={entitlement_id:'e1',status:'ACTIVE',product:'mn',resource_id:'x'};
  assert.equal(canAccess({actor:{id:'u'},content:paid,entitlements:[ent]}).allowed,true);
  assert.equal(canAccess({actor:{id:'u'},content:paid,entitlements:[]}).allowed,false);
});
test('version chain rejects duplicate versions and broken supersession',()=>{
  assert.equal(validateVersionChains([base,{...base}]).valid,false);
  const old={...base,version:'0.9.0',status:'SUPERSEDED',superseded_by:'1.0.0'};
  assert.equal(validateVersionChains([old,base]).valid,true);
});
test('release manifest is product-scoped',()=>{
  const gc={...base,id:'g',product:'gc',extensions:{gc:{}},content_type:'book'};
  const manifest=buildReleaseManifest({release_id:'r1',product:'mn',git_sha:'abc',content:[base,gc],tests:[{name:'unit',status:'PASS'}]});
  assert.equal(manifest.product,'mn');
  assert.deepEqual(manifest.content_versions.map(x=>x.id),['x']);
  assert.deepEqual(manifest.truth.production_verified,['x']);
});
test('summary exposes operational truth',()=>{
  const blocked={...base,id:'b',rights_status:'RIGHTS_UNCLEAR',release_status:{...releaseOn,rights_cleared:false,qa_complete:false}};
  const truth=summarizeReleaseTruth([base,blocked],'mn');
  assert.deepEqual(truth.unresolved_rights,['b']);
  assert.deepEqual(truth.failed_qa,['b']);
});
test('audit event requires accountable actor and product',()=>{
  const event=makeAuditEvent({event_id:'evt1',actor_id:'u1',product:'gc',action:'PUBLISH',target_type:'content',target_id:'c1',evidence_ref:'review:12'});
  assert.equal(event.action,'PUBLISH');
  assert.throws(()=>makeAuditEvent({event_id:'x',product:'gc',action:'PUBLISH',target_type:'content',target_id:'c'}));
});
