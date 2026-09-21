export const ENGINE_VERSION = '1.0.0';

export const PRODUCTS = Object.freeze(['mn', 'gc']);
export const CONTENT_STATUSES = Object.freeze(['PLANNED','IN_PRODUCTION','BETA','COMPLETE','SUPERSEDED','ARCHIVED']);
export const WORKFLOW_STATES = Object.freeze([
  'DRAFT','EDITORIAL_REVIEW','LEGAL_REVIEW','CURRICULUM_REVIEW','DESIGN_QA','RIGHTS_REVIEW',
  'ACCESSIBILITY_REVIEW','SECURITY_REVIEW','QA','RELEASE_CANDIDATE','RELEASE_APPROVED'
]);
export const RIGHTS_CLASSIFICATIONS = Object.freeze([
  'ORIGINAL','USER_OWNED','COMMISSIONED','LICENSED','PUBLIC_DOMAIN','OPEN_LICENSE','OFFICIAL_SOURCE',
  'PERMISSION_GRANTED','RESTRICTED','RIGHTS_UNCLEAR'
]);
export const SHARED_CONTENT_TYPES = Object.freeze([
  'book','article','collection','course','lesson','assessment','media','diagram','glossary','checklist','downloadable_asset'
]);
export const PRODUCT_CONTENT_TYPES = Object.freeze({
  mn: ['mission','mock_exam','prayer','children_reader','faith_lesson','daily_spark','family_resource'],
  gc: ['red_note','red_line','country_note','contract_guide','legal_checklist','negotiation_playbook','tender_guide','professional_course']
});

const ALL_REQUIRED_RELEASE_FLAGS = Object.freeze([
  'content_complete','qa_complete','rights_cleared','security_cleared','accessibility_checked','release_approved','deployed','production_verified'
]);

export const PRODUCT_CONFIG = Object.freeze({
  mn: Object.freeze({
    namespace: 'mn',
    contentTypes: Object.freeze([...SHARED_CONTENT_TYPES, ...PRODUCT_CONTENT_TYPES.mn]),
    extensionFields: Object.freeze(['grade','curriculum','subject','faith_track','learning_objective','assessment_type','reading_level']),
    searchFilters: Object.freeze(['grade','subject','language','curriculum','faith_track','content_type','status']),
    audienceBoundary: 'child-family-learning'
  }),
  gc: Object.freeze({
    namespace: 'gc',
    contentTypes: Object.freeze([...SHARED_CONTENT_TYPES, ...PRODUCT_CONTENT_TYPES.gc]),
    extensionFields: Object.freeze(['jurisdiction','contract_form','edition','clause','legal_source','professional_role','sector','legal_review_date']),
    searchFilters: Object.freeze(['jurisdiction','contract_form','edition','clause','topic','series','language','last_reviewed_date']),
    audienceBoundary: 'professional-legal'
  })
});

function isObject(value){ return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function asArray(value){ return Array.isArray(value) ? value : []; }
function normaliseText(value){ return String(value ?? '').trim().toLowerCase(); }
function validDate(value){ return !value || !Number.isNaN(Date.parse(value)); }
function unique(values){ return [...new Set(values)]; }

export function validateContent(content){
  const errors=[];
  const warnings=[];
  if(!isObject(content)) return {valid:false, errors:['content must be an object'], warnings};
  for(const field of ['id','product','content_type','title','slug','version','status','workflow_state']){
    if(!content[field]) errors.push(`missing ${field}`);
  }
  if(content.product && !PRODUCTS.includes(content.product)) errors.push(`unknown product ${content.product}`);
  const cfg=PRODUCT_CONFIG[content.product];
  if(cfg && content.content_type && !cfg.contentTypes.includes(content.content_type)) errors.push(`unsupported ${content.product} content_type ${content.content_type}`);
  if(content.status && !CONTENT_STATUSES.includes(content.status)) errors.push(`invalid status ${content.status}`);
  if(content.workflow_state && !WORKFLOW_STATES.includes(content.workflow_state)) errors.push(`invalid workflow_state ${content.workflow_state}`);
  if(content.publication_date && !validDate(content.publication_date)) errors.push('invalid publication_date');
  if(content.last_reviewed_date && !validDate(content.last_reviewed_date)) errors.push('invalid last_reviewed_date');
  if(!isObject(content.release_status)) errors.push('release_status must be an object');
  else {
    for(const flag of ALL_REQUIRED_RELEASE_FLAGS){
      if(typeof content.release_status[flag] !== 'boolean') errors.push(`release_status.${flag} must be boolean`);
    }
  }
  if(!isObject(content.provenance)) errors.push('provenance must be an object');
  if(!content.rights_status) errors.push('missing rights_status');
  if(content.extensions && !isObject(content.extensions)) errors.push('extensions must be an object');
  if(isObject(content.extensions)){
    const wrongProduct = content.product === 'mn' ? 'gc' : content.product === 'gc' ? 'mn' : null;
    if(wrongProduct && content.extensions[wrongProduct]) errors.push(`cross-product extension leak: ${wrongProduct}`);
  }
  if(content.status === 'COMPLETE' && content.release_status?.content_complete !== true) errors.push('COMPLETE requires release_status.content_complete=true');
  if(content.status === 'SUPERSEDED' && !content.superseded_by) warnings.push('SUPERSEDED without superseded_by relation');
  if(content.status === 'ARCHIVED' && content.release_status?.deployed === true) warnings.push('ARCHIVED content is still marked deployed');
  if(content.migration_state === 'LEGACY_REVIEW_REQUIRED') warnings.push('legacy-imported content is not governed for new publication');
  return {valid:errors.length===0,errors,warnings};
}

export function validateAsset(asset){
  const errors=[];
  const warnings=[];
  if(!isObject(asset)) return {valid:false,errors:['asset must be an object'],warnings};
  for(const field of ['asset_id','product','owner','source','acquisition_method','rights_classification','release_clearance']){
    if(asset[field] === undefined || asset[field] === null || asset[field] === '') errors.push(`missing ${field}`);
  }
  if(asset.product && !PRODUCTS.includes(asset.product)) errors.push(`unknown product ${asset.product}`);
  if(asset.rights_classification && !RIGHTS_CLASSIFICATIONS.includes(asset.rights_classification)) errors.push(`invalid rights_classification ${asset.rights_classification}`);
  if(typeof asset.release_clearance !== 'boolean') errors.push('release_clearance must be boolean');
  if(['RESTRICTED','RIGHTS_UNCLEAR'].includes(asset.rights_classification) && asset.release_clearance === true) errors.push('restricted/unclear asset cannot be release-cleared');
  if(asset.attribution_required === true && !asset.attribution_text) warnings.push('attribution required but attribution_text missing');
  return {valid:errors.length===0,errors,warnings};
}

export function rightsDecision(asset){
  const check=validateAsset(asset);
  const blocked = !check.valid || ['RESTRICTED','RIGHTS_UNCLEAR'].includes(asset?.rights_classification) || asset?.release_clearance !== true;
  return {
    allowed: !blocked,
    reason: blocked ? (check.errors[0] || `asset ${asset?.rights_classification || 'UNKNOWN'} is not release-cleared`) : 'RIGHTS_CLEARED',
    errors: check.errors,
    warnings: check.warnings
  };
}

export function publicationGate(content, assetsById = new Map()){
  const check=validateContent(content);
  const blockers=[...check.errors];
  const release=content?.release_status || {};
  for(const flag of ALL_REQUIRED_RELEASE_FLAGS){
    if(release[flag] !== true) blockers.push(`release gate not satisfied: ${flag}`);
  }
  for(const assetId of asArray(content?.asset_references)){
    const asset=assetsById instanceof Map ? assetsById.get(assetId) : assetsById?.[assetId];
    if(!asset){ blockers.push(`missing asset ${assetId}`); continue; }
    const rights=rightsDecision(asset);
    if(!rights.allowed) blockers.push(`asset ${assetId}: ${rights.reason}`);
    if(asset.product !== content.product) blockers.push(`asset ${assetId}: cross-product asset reference`);
  }
  return {allowed:blockers.length===0, blockers:unique(blockers), warnings:check.warnings};
}

export function normaliseLegacyRecord({product, source_file, id, title, content_type='article', slug, version='0.0.0-import', extensions={}}){
  if(!PRODUCTS.includes(product)) throw new Error(`unknown product ${product}`);
  return {
    id,
    product,
    content_type,
    title,
    slug: slug || id,
    version,
    status:'IN_PRODUCTION',
    workflow_state:'RIGHTS_REVIEW',
    rights_status:'RIGHTS_UNCLEAR',
    provenance:{source_file, acquisition_method:'LEGACY_IMPORT', imported:true},
    release_status:{
      content_complete:false,qa_complete:false,rights_cleared:false,security_cleared:false,
      accessibility_checked:false,release_approved:false,deployed:false,production_verified:false
    },
    extensions:{[product]:extensions},
    asset_references:[],
    migration_state:'LEGACY_REVIEW_REQUIRED'
  };
}

function entitlementMatches(entitlement, content, now){
  if(!entitlement || entitlement.status !== 'ACTIVE') return false;
  if(entitlement.product !== content.product) return false;
  if(entitlement.starts_at && Date.parse(entitlement.starts_at) > now) return false;
  if(entitlement.ends_at && Date.parse(entitlement.ends_at) <= now) return false;
  if(entitlement.resource_id && entitlement.resource_id === content.id) return true;
  if(entitlement.collection && entitlement.collection === content.collection) return true;
  if(entitlement.product_wide === true) return true;
  if(asArray(entitlement.content_types).includes(content.content_type)) return true;
  return false;
}

export function canAccess({actor={}, content, entitlements=[], now=Date.now(), preview=false}){
  if(!content || !PRODUCTS.includes(content.product)) return {allowed:false, reason:'INVALID_CONTENT'};
  const roles=asArray(actor.roles);
  const productRoles=asArray(actor.product_roles?.[content.product]);
  const isAdmin=roles.includes('ank_admin') || productRoles.includes('admin');
  if(preview && isAdmin) return {allowed:true,reason:'ADMIN_PREVIEW'};

  const release=content.release_status || {};
  if(!(release.release_approved && release.deployed && release.production_verified)) return {allowed:false,reason:'NOT_PUBLICLY_VERIFIED'};

  const policy=content.entitlement_policy || {mode:'FREE'};
  if(policy.mode === 'FREE') return {allowed:true,reason:'FREE'};
  if(policy.mode === 'AUTHENTICATED') return actor.id ? {allowed:true,reason:'AUTHENTICATED'} : {allowed:false,reason:'SIGN_IN_REQUIRED'};
  if(policy.mode === 'FAMILY'){
    if(!actor.id) return {allowed:false,reason:'SIGN_IN_REQUIRED'};
    const allowedHouseholds=asArray(policy.household_ids);
    const actorHouseholds=asArray(actor.household_ids);
    return actorHouseholds.some(id=>allowedHouseholds.includes(id)) ? {allowed:true,reason:'FAMILY_RELATIONSHIP'} : {allowed:false,reason:'FAMILY_SCOPE_DENIED'};
  }
  if(policy.mode === 'ORGANISATION'){
    if(!actor.id) return {allowed:false,reason:'SIGN_IN_REQUIRED'};
    const allowedOrgs=asArray(policy.organization_ids);
    const actorOrgs=asArray(actor.organization_ids);
    return actorOrgs.some(id=>allowedOrgs.includes(id)) ? {allowed:true,reason:'ORGANISATION_RELATIONSHIP'} : {allowed:false,reason:'ORGANISATION_SCOPE_DENIED'};
  }
  if(['PAID','SUBSCRIPTION','LIFETIME','TRIAL','SPONSORED','BUNDLE'].includes(policy.mode)){
    const match=entitlements.find(ent=>entitlementMatches(ent,content,now));
    return match ? {allowed:true,reason:`ENTITLEMENT:${match.entitlement_id || 'MATCH'}`} : {allowed:false,reason:'ENTITLEMENT_REQUIRED'};
  }
  return {allowed:false,reason:'UNKNOWN_ENTITLEMENT_POLICY'};
}

export function searchContent({items=[], product, query='', filters={}, actor={}, entitlements=[], includePreview=false}){
  if(!PRODUCTS.includes(product)) throw new Error('product scope is required and must be mn or gc');
  const cfg=PRODUCT_CONFIG[product];
  for(const key of Object.keys(filters)) if(!cfg.searchFilters.includes(key)) throw new Error(`unsupported ${product} search filter ${key}`);
  const q=normaliseText(query);
  return items.filter(item=>{
    if(item.product !== product) return false;
    if(!canAccess({actor,content:item,entitlements,preview:includePreview}).allowed) return false;
    for(const [key,expected] of Object.entries(filters)){
      const value = key === 'content_type' || key === 'status' ? item[key] : item.extensions?.[product]?.[key] ?? item[key];
      if(Array.isArray(expected)){ if(!expected.includes(value)) return false; }
      else if(value !== expected) return false;
    }
    if(!q) return true;
    const hay=[item.title,item.subtitle,item.series,item.collection,item.language,
      ...Object.values(item.extensions?.[product] || {}).flatMap(v=>Array.isArray(v)?v:[v])
    ].map(normaliseText).join(' ');
    return hay.includes(q);
  });
}

export function validateVersionChains(items=[]){
  const errors=[];
  const seen=new Set();
  for(const item of items){
    const key=`${item.product}:${item.id}:${item.version}`;
    if(seen.has(key)) errors.push(`duplicate version ${key}`);
    seen.add(key);
  }
  for(const item of items){
    if(!item.superseded_by) continue;
    const candidates=items.filter(other=>other.product===item.product && other.id===item.id && other.version===item.superseded_by);
    if(candidates.length !== 1) errors.push(`${item.product}:${item.id}:${item.version} has broken superseded_by ${item.superseded_by}`);
  }
  return {valid:errors.length===0,errors};
}

export function buildReleaseManifest({release_id, product, git_sha=null, build_id=null, deployment_id=null, content=[], migrations=[], tests=[], known_defects=[]}){
  if(!release_id) throw new Error('release_id required');
  if(!PRODUCTS.includes(product)) throw new Error('valid product required');
  const scoped=content.filter(x=>x.product===product);
  const versionCheck=validateVersionChains(scoped);
  if(!versionCheck.valid) throw new Error(versionCheck.errors.join('; '));
  return {
    schema_version:'1.0.0',
    engine_version:ENGINE_VERSION,
    release_id,
    product,
    git_sha,
    build_id,
    deployment_id,
    generated_at:new Date().toISOString(),
    content_versions:scoped.map(x=>({id:x.id,version:x.version,status:x.status,workflow_state:x.workflow_state,production_verified:Boolean(x.release_status?.production_verified)})),
    newly_published:scoped.filter(x=>x.release_status?.production_verified && !x.previous_version).map(x=>x.id),
    updated_items:scoped.filter(x=>Boolean(x.previous_version)).map(x=>x.id),
    superseded_items:scoped.filter(x=>x.status==='SUPERSEDED').map(x=>x.id),
    migration_state:migrations,
    test_state:tests,
    known_defects,
    truth:summarizeReleaseTruth(scoped,product)
  };
}

export function summarizeReleaseTruth(items=[], product, {staleDays=365, now=Date.now()}={}){
  if(!PRODUCTS.includes(product)) throw new Error('valid product required');
  const scoped=items.filter(x=>x.product===product);
  const counts=Object.fromEntries(CONTENT_STATUSES.map(s=>[s,0]));
  for(const item of scoped) if(counts[item.status] !== undefined) counts[item.status]++;
  const stale=scoped.filter(item=>{
    if(!item.last_reviewed_date) return false;
    return now - Date.parse(item.last_reviewed_date) > staleDays*24*60*60*1000;
  }).map(x=>x.id);
  return {
    product,
    counts,
    unresolved_rights:scoped.filter(x=>x.rights_status !== 'CLEARED' && x.release_status?.rights_cleared !== true).map(x=>x.id),
    failed_qa:scoped.filter(x=>x.release_status?.qa_complete !== true).map(x=>x.id),
    deployed:scoped.filter(x=>x.release_status?.deployed === true).map(x=>x.id),
    production_verified:scoped.filter(x=>x.release_status?.production_verified === true).map(x=>x.id),
    stale,
    migration_review_required:scoped.filter(x=>x.migration_state==='LEGACY_REVIEW_REQUIRED').map(x=>x.id)
  };
}

export function makeAuditEvent({event_id, actor_id, product, action, target_type, target_id, evidence_ref, at=new Date().toISOString(), metadata={}}){
  if(!event_id || !actor_id || !PRODUCTS.includes(product) || !action || !target_type || !target_id) throw new Error('incomplete audit event');
  return Object.freeze({event_id,actor_id,product,action,target_type,target_id,evidence_ref:evidence_ref || null,at,metadata});
}
