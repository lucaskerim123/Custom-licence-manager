import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  FALLBACK_SERVICES,productionCredential,assertFallbackMode,
  assertFallbackProject,productionEnvironmentName
} from './repair-fallback-production.mjs';

const fallbackVercel='v'.repeat(48);
const records=[
 {key:'ORBITFS_FALLBACK_GITHUB_TOKEN',target:['production'],value:'g'.repeat(48)},
 {key:'ORBITFS_FALLBACK_VERCEL_TOKEN',target:['production'],value:fallbackVercel},
 {key:'ORBITFS_FALLBACK_VERCEL_TOKEN',target:['preview'],value:'preview-only-not-for-use'},
];

test('credentials are taken from Main License Manager Production only',()=>{
 assert.equal(productionCredential(records,'ORBITFS_FALLBACK_VERCEL_TOKEN'),fallbackVercel);
 assert.throws(()=>productionCredential(records,'VERCEL_TOKEN'),/exactly one Production/);
 assert.throws(()=>productionCredential([{key:'ORBITFS_FALLBACK_VERCEL_TOKEN',target:['preview'],value:fallbackVercel}],
  'ORBITFS_FALLBACK_VERCEL_TOKEN'),/exactly one Production/);
 assert.throws(()=>productionCredential([...records,records[1]],'ORBITFS_FALLBACK_VERCEL_TOKEN'),/exactly one Production/);
 assert.throws(()=>productionCredential([{key:'ORBITFS_FALLBACK_VERCEL_TOKEN',target:['production'],value:'change-me'}],
  'ORBITFS_FALLBACK_VERCEL_TOKEN'),/placeholder/);
});
test('MAIN, missing authority, wrong Fallback owner and wrong Vercel project fail closed',()=>{
 assertFallbackMode({profile:'fallback',mode:'fallback'});
 for(const state of [{profile:'primary',mode:'main'},{mode:'fallback'},{}])
  assert.throws(()=>assertFallbackMode(state),/not in FALLBACK/);
 const service=FALLBACK_SERVICES[0];
 assertFallbackProject({id:service.project,accountId:'team_0fWVaLb24pyeeCRqqYu5G47K',name:service.projectName},service);
 assert.throws(()=>assertFallbackProject({id:service.project,accountId:'wrong',name:service.projectName},service),/Wrong Fallback/);
 assert.throws(()=>assertFallbackProject({id:'wrong',accountId:'team_0fWVaLb24pyeeCRqqYu5G47K',name:service.projectName},service),/Wrong Fallback/);
});
test('production GitHub environments are exact, not implicit',()=>{
 assert.equal(productionEnvironmentName({environments:[{name:'preview'},{name:'production'}]},'owner/repo'),'production');
 assert.throws(()=>productionEnvironmentName({environments:[]},'owner/repo'),/Production environment/);
 assert.throws(()=>productionEnvironmentName({environments:[{name:'Production'},{name:'production'}]},'owner/repo'),/Production environment/);
});
test('all three declared service workflows and projects are distinct',()=>{
 assert.equal(FALLBACK_SERVICES.length,3);
 assert.equal(new Set(FALLBACK_SERVICES.map(x=>x.repo)).size,3);
 assert.equal(new Set(FALLBACK_SERVICES.map(x=>x.project)).size,3);
 assert.ok(FALLBACK_SERVICES.every(x=>x.repo.startsWith('remipetrovich-design/')));
 assert.deepEqual(FALLBACK_SERVICES.map(x=>x.workflow),[
  'deploy-dev-panel.yml','quick-deploy.yml','quick-redesign-deploy.yml'
 ]);
});
test('manual repair never commits credentials or alters customer release/update implementation',()=>{
 const source=readFileSync('scripts/repair-fallback-production.mjs','utf8');
 const workflow=readFileSync('.github/workflows/repair-fallback-vercel-connection.yml','utf8');
 assert.match(source,/crypto_box_seal/);
 assert.match(source,/secrets\/public-key/);
 assert.match(source,/secrets\/VERCEL_TOKEN/);
 assert.match(source,/No GitHub secrets were changed/);
 assert.match(source,/ref:'main'/);
 assert.doesNotMatch(source,/console\.(?:log|error)\([^;\n]*(?:fallbackVercel|githubToken|mainVercel|sealed|value)/);
 assert.match(workflow,/workflow_dispatch:/);
 assert.match(workflow,/github\.event_name == 'workflow_dispatch'/);
 assert.match(workflow,/secrets\.VERCEL_TOKEN/);
 assert.doesNotMatch(workflow,/(?:BASE_RELEASE_REPO|ENGINE_RELEASE_REPO|CUSTOMER_DB_URL)/);
});
