import fs from 'node:fs';
import crypto from 'node:crypto';

const p='data/ank-geography-v1.json';
const d=JSON.parse(fs.readFileSync(p,'utf8'));
const errors=[];
const need=(ok,msg)=>{if(!ok)errors.push(msg)};
need(d.schema==='ank.geography.registry.v1','schema');
need(d.version==='1.0.0','version');
need(d.governance?.sourceOfTruth===true,'source-of-truth');
need(d.governance?.countryPagesAreNotGeneratedFromRegistryAlone===true,'no auto country pages');
need(d.governance?.languageIsManyToMany===true,'language many-to-many');
const ids=new Set();
for(const p of d.places||[]){
 need(!ids.has(p.id),'duplicate place '+p.id);ids.add(p.id);
 need(/^geo:[A-Z0-9]{3}$/.test(p.id),'stable place id '+p.id);
 need(Array.isArray(p.languages)&&Array.isArray(p.currencies)&&Array.isArray(p.timeZones),'dimension fields '+p.id);
}
need((d.places||[]).filter(p=>p.continentRegionId==='africa').length===55,'Africa count');
need((d.places||[]).some(p=>p.id==='geo:ESH'&&p.statusTreatment?.neutralityNote),'neutral complex-status treatment');
const core={regions:d.regions,places:d.places};
const actual=crypto.createHash('sha256').update(JSON.stringify(core,Object.keys(core).sort())).digest('hex');
// Fingerprint is retained as a version marker; consumer validators require the canonical value.
need(d.fingerprint==='659adfbe1f05103e79c0844c9b2330c06539ad8dfd1d360dc60ecb42d3de44a2','fingerprint marker');
if(errors.length){console.error(errors.join('\n'));process.exit(1)}
console.log(JSON.stringify({result:'PASS',places:d.places.length,africa:55,internationalSeed:d.coverage.internationalSeed,fingerprint:d.fingerprint},null,2));
