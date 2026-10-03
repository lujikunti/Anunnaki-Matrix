import test from 'node:test';
import assert from 'node:assert/strict';
import { editorialReviewDecision, publicationGate } from '../src/index.mjs';

const releaseOn={
  content_complete:true,qa_complete:true,rights_cleared:true,security_cleared:true,
  accessibility_checked:true,release_approved:true,deployed:true,production_verified:true
};

function candidate(product='mn', overrides={}){
  const content={
    id:'candidate-1',product,content_type:'book',title:'Candidate',slug:'candidate',
    version:'2.0.0',status:'COMPLETE',workflow_state:'RELEASE_APPROVED',
    rights_status:'CLEARED',provenance:{source:'authoring-system'},
    content_hash:'sha256:current',
    author_id:'author-1',
    editorial_policy:'REQUIRED',
    editorial_review:{
      status:'APPROVED',
      content_id:'candidate-1',
      version:'2.0.0',
      content_hash:'sha256:current',
      editorial_agent_id:'ank-editorial',
      checks_status:'PASS',
      blocking_findings:0,
      approved_at:'2026-10-02T04:00:00.000Z',
      approvals:[
        {role:'EDITOR',actor_type:'HUMAN',actor_id:'editor-1',approved:true,version:'2.0.0',content_hash:'sha256:current'},
        {role:product==='gc'?'LEGAL_REVIEWER':'CURRICULUM_REVIEWER',actor_type:'HUMAN',actor_id:'reviewer-1',approved:true,version:'2.0.0',content_hash:'sha256:current'}
      ]
    },
    release_status:{...releaseOn},
    asset_references:[],
    extensions:{[product]:{}}
  };
  return {...content,...overrides};
}

test('matching PIE receipt and independent product reviewers satisfy editorial gate',()=>{
  const result=editorialReviewDecision(candidate('mn'));
  assert.equal(result.allowed,true);
  assert.equal(result.reason,'EDITORIAL_REVIEW_VERIFIED');
  assert.equal(publicationGate(candidate('gc')).allowed,true);
});

test('required review fails closed when receipt is missing',()=>{
  const item=candidate('mn',{editorial_review:null});
  const result=editorialReviewDecision(item);
  assert.equal(result.allowed,false);
  assert.ok(result.blockers.includes('editorial review receipt missing'));
});

test('stale version or changed content hash invalidates approval',()=>{
  const stale=candidate('mn',{version:'2.0.1'});
  assert.equal(editorialReviewDecision(stale).allowed,false);
  const changed=candidate('mn',{content_hash:'sha256:changed'});
  assert.equal(editorialReviewDecision(changed).allowed,false);
});

test('GC release requires legal review and MN release requires curriculum review',()=>{
  const gc=candidate('gc');
  gc.editorial_review.approvals=gc.editorial_review.approvals.filter(x=>x.role!=='LEGAL_REVIEWER');
  assert.ok(editorialReviewDecision(gc).blockers.some(x=>x.includes('LEGAL_REVIEWER')));
  const mn=candidate('mn');
  mn.editorial_review.approvals=mn.editorial_review.approvals.filter(x=>x.role!=='CURRICULUM_REVIEWER');
  assert.ok(editorialReviewDecision(mn).blockers.some(x=>x.includes('CURRICULUM_REVIEWER')));
});

test('one person cannot satisfy both independent approval roles',()=>{
  const item=candidate('mn');
  item.editorial_review.approvals[1].actor_id='editor-1';
  const result=editorialReviewDecision(item);
  assert.equal(result.allowed,false);
  assert.ok(result.blockers.includes('editor and domain approvals must come from different humans'));
});

test('author cannot approve the candidate and unflagged legacy records retain prior behavior',()=>{
  const item=candidate('mn');
  item.editorial_review.approvals[0].actor_id='author-1';
  assert.equal(editorialReviewDecision(item).allowed,false);
  const legacy=candidate('mn',{editorial_policy:undefined,editorial_review:undefined,content_hash:undefined});
  assert.equal(editorialReviewDecision(legacy).allowed,true);
  assert.equal(publicationGate(legacy).allowed,true);
});

test('explicit legacy exception requires an audited independent human decision',()=>{
  const item=candidate('mn',{editorial_policy:'LEGACY_APPROVED',editorial_review:{
    status:'LEGACY_APPROVED',migration_reference:'migration:2026-10:mn-001',
    migration_approval:{actor_type:'HUMAN',actor_id:'editor-legacy',role:'EDITOR',reason:'Already released before the editorial gate; recorded for scheduled review.',approved_at:'2026-10-02T04:00:00.000Z'}
  }});
  assert.equal(editorialReviewDecision(item).allowed,true);
  item.editorial_review.migration_reference='';
  assert.equal(editorialReviewDecision(item).allowed,false);
});

test('publication gate reports missing editorial evidence even when other release flags pass',()=>{
  const item=candidate('mn',{editorial_review:{...candidate('mn').editorial_review,checks_status:'UNKNOWN'}});
  const gate=publicationGate(item);
  assert.equal(gate.allowed,false);
  assert.ok(gate.blockers.some(x=>x.includes('editorial review: editorial checks are not all passed')));
});
