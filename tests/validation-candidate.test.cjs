const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { runId, validateManifest, verifyPR, resolveCandidate, run } = require('../validation-candidate/policy.cjs');

const repo = { owner: 'pagopa', repo: 'service' };
const fullName = 'pagopa/service';
const sha = 'a'.repeat(40);
const registry = '123456789012.dkr.ecr.eu-central-1.amazonaws.com';
const completed = '2026-01-01T12:00:00Z';
const manifest = { schema: 1, repository: fullName, sha, tree: 'b'.repeat(40), run_id: '123', branch: 'validation',
  digest: `sha256:${'c'.repeat(64)}`, image: `${registry}/service`, chart_sha256: 'd'.repeat(64), ticket: '', companion: '' };
const candidate = { ...manifest, completed_at: completed };
const workflow = { id: 123, path: '.github/workflows/deploy-ms-validation.yml', event: 'workflow_dispatch',
  conclusion: 'success', run_attempt: 1, head_sha: sha, head_branch: 'validation', updated_at: completed,
  head_repository: { full_name: fullName } };
const pr = { number: 1, state: 'open', body: 'VAL-Run: 123', base: { ref: 'main', sha: 'e'.repeat(40) },
  head: { ref: 'validation', sha, repo: { full_name: fullName } }, user: { login: 'author' } };
const review = { state: 'APPROVED', user: { login: 'reviewer' }, author_association: 'MEMBER',
  commit_id: sha, submitted_at: '2026-01-01T12:01:00Z', body: 'VAL-Run: 123' };
const deployment = { id: 9, sha, payload: { source: 'validation-candidate/v1', run_id: 123 } };
function mock() {
  const state = { reviews: [structuredClone(review)], deployments: [structuredClone(deployment)], status: 'success', comparison: 'ahead', files: [] };
  const github = {
    paginate: async method => ({ reviews: state.reviews, deployments: state.deployments, files: state.files })[method],
    rest: {
      pulls: { listReviews: 'reviews', listFiles: 'files' },
      repos: { listDeployments: 'deployments', listDeploymentStatuses: async () => ({ data: [{ state: state.status }] }),
        getCollaboratorPermissionLevel: async () => ({ data: { permission: state.permission || 'write' } }),
        compareCommitsWithBasehead: async () => ({ data: { status: state.comparison } }) }
    }
  };
  return { github, state };
}
const load = async () => structuredClone(candidate);

test('run reference must be unique and numeric', () => {
  assert.equal(runId('VAL-Run: 123\r\n'), '123');
  for (const body of ['', 'VAL-Run: 0', 'VAL-Run: 123; x', 'VAL-Run: 123\nVAL-Run: 124']) assert.throws(() => runId(body));
});

test('candidate manifest validates provenance and allows optional metadata', () => {
  assert.equal(validateManifest(manifest, workflow, fullName, registry).sha, sha);
  for (const patch of [{sha:'f'.repeat(40)}, {repository:'other/service'}, {run_id:'124'}, {branch:'feature/x'},
    {digest:'latest'}, {image:'other'}, {chart_sha256:'bad'}, {ticket:null}])
    assert.throws(() => validateManifest({ ...manifest, ...patch }, workflow, fullName, registry));
});

test('PR requires matching post-deploy approval and latest successful VAL state', async () => {
  const { github, state } = mock();
  assert.equal((await verifyPR(github, repo, pr, registry, '', load)).sha, sha);
  for (const invalid of [
    { ...review, body: '' }, { ...review, body: 'VAL-Run: 124' },
    { ...review, commit_id: 'f'.repeat(40) }, { ...review, submitted_at: '2026-01-01T11:59:00Z' },
    { ...review, user: { login: 'author' } }, { ...review, author_association: 'NONE' }
  ]) {
    state.reviews = [invalid];
    await assert.rejects(verifyPR(github, repo, pr, registry, '', load), /Missing PR approval/);
  }
  state.reviews = [review, { ...review, state: 'DISMISSED' }];
  await assert.rejects(verifyPR(github, repo, pr, registry, '', load), /Missing PR approval/);
  state.reviews = [review, { ...review, state: 'CHANGES_REQUESTED', user: { login: 'other' } }];
  await assert.rejects(verifyPR(github, repo, pr, registry, '', load), /unresolved change requests/);
  state.reviews = [review]; state.permission = 'read';
  await assert.rejects(verifyPR(github, repo, pr, registry, '', load), /Missing PR approval/);
  state.permission = 'write';
  state.reviews = [review]; state.deployments = [{ ...deployment, payload: { ...deployment.payload, run_id: 124 } }];
  await assert.rejects(verifyPR(github, repo, pr, registry, '', load), /exact candidate/);
  state.deployments = [deployment]; state.status = 'in_progress';
  await assert.rejects(verifyPR(github, repo, pr, registry, '', load), /incomplete/);
  state.status = 'success'; state.comparison = 'diverged';
  await assert.rejects(verifyPR(github, repo, pr, registry, '', load), /Merge main/);
});

test('PR rejects forks, changed head and untrusted branches', async () => {
  const { github } = mock();
  for (const modified of [
    { ...pr, head: { ...pr.head, sha: 'f'.repeat(40) } },
    { ...pr, head: { ...pr.head, ref: 'feature/x' } },
    { ...pr, head: { ...pr.head, repo: { full_name: 'evil/service' } } }
  ]) await assert.rejects(verifyPR(github, repo, modified, registry, '', load));
});

test('release metadata exception is restricted to configured bot and paths', async () => {
  const { github, state } = mock();
  const release = { ...pr, head: { ...pr.head, ref: 'release-please--branches--main' }, user: { login: 'bot' } };
  state.files = [{ filename: 'version.txt' }];
  assert.equal(await verifyPR(github, repo, release, registry, 'bot'), null);
  await assert.rejects(verifyPR(github, repo, release, registry, 'other'));
  state.files = [{ filename: 'src/index.js' }];
  await assert.rejects(verifyPR(github, repo, release, registry, 'bot'));
});

test('resolve candidate requires successful first dispatch and valid archive', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'val-test-'));
  try {
    fs.writeFileSync(path.join(dir, 'candidate.json'), JSON.stringify(manifest));
    execFileSync('zip', ['-q', 'artifact.zip', 'candidate.json'], { cwd: dir });
    const zip = fs.readFileSync(path.join(dir, 'artifact.zip'));
    let metadata = workflow;
    const github = { paginate: async () => [{ id: 1, name: 'val-candidate', expired: false }], rest: { actions: {
      getWorkflowRun: async () => ({ data: metadata }), listWorkflowRunArtifacts: 'artifacts', downloadArtifact: async () => ({ data: zip })
    } } };
    assert.equal((await resolveCandidate(github, repo, '123', registry)).completed_at, completed);
    for (const patch of [{conclusion:'failure'}, {run_attempt:2}, {event:'pull_request'}, {updated_at:null},
      {head_repository:{full_name:'other/service'}}]) {
      metadata = { ...workflow, ...patch };
      await assert.rejects(resolveCandidate(github, repo, '123', registry));
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('runtime ledger records only in the val environment', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'val-state-test-'));
  const saved = { ...process.env };
  try {
    const file=path.join(dir,'candidate.json'); fs.writeFileSync(file,JSON.stringify(manifest));
    Object.assign(process.env,{ POLICY_MODE:'record', CANDIDATE_FILE:file, DEPLOYMENT_STATE:'in_progress', DEPLOYMENT_ENVIRONMENT:'val' });
    let created;
    const statuses=[];
    const github={paginate:async()=>[pr],rest:{pulls:{list:'prs'},repos:{ createDeployment:async a=>{created=a;return {data:{id:1}}}, createDeploymentStatus:async()=>{}, createCommitStatus:async a=>statuses.push(a) }}};
    await run({github,context:{repo,runId:123,serverUrl:'https://github.com'},core:{}});
    assert.equal(created.environment,'val'); assert.equal(created.payload.source,'validation-candidate/v1');
    assert.equal(statuses[0].state,'failure'); assert.equal(statuses[0].sha,sha);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); for(const key of ['POLICY_MODE','CANDIDATE_FILE','DEPLOYMENT_STATE','DEPLOYMENT_ENVIRONMENT']) { if(saved[key]===undefined) delete process.env[key]; else process.env[key]=saved[key]; } }
});

test('rollback accepts only a run with a matching approved promotion PR', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'val-rollback-test-'));
  const saved={...process.env};
  try {
    fs.writeFileSync(path.join(dir,'candidate.json'),JSON.stringify(manifest));
    execFileSync('zip',['-q','artifact.zip','candidate.json'],{cwd:dir});
    const zip=fs.readFileSync(path.join(dir,'artifact.zip'));
    Object.assign(process.env,{POLICY_MODE:'candidate',CANDIDATE_RUN_ID:'123',PROD_ACCOUNT_ID:'123456789012',AWS_REGION:'eu-central-1'});
    let reviews=[review];
    const gh={paginate:async method=>({artifacts:[{id:1,name:'val-candidate'}],prs:[pr],reviews})[method],rest:{
      actions:{getWorkflowRun:async()=>({data:workflow}),listWorkflowRunArtifacts:'artifacts',downloadArtifact:async()=>({data:zip})},
      pulls:{list:'prs',listReviews:'reviews'},repos:{getCollaboratorPermissionLevel:async()=>({data:{permission:'write'}})}}};
    const outputs={}; const core={setOutput:(k,v)=>outputs[k]=v};
    await run({github:gh,context:{repo},core}); assert.equal(outputs.digest,manifest.digest);
    reviews=[]; await assert.rejects(run({github:gh,context:{repo},core}),/no matching approved/);
  } finally {fs.rmSync(dir,{recursive:true,force:true});for(const key of ['POLICY_MODE','CANDIDATE_RUN_ID','PROD_ACCOUNT_ID','AWS_REGION']) {if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
});

test('release rejects a changed merge tree and advanced main', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'val-release-test-')); const saved={...process.env};
  try {
    fs.writeFileSync(path.join(dir,'candidate.json'),JSON.stringify(manifest));execFileSync('zip',['-q','artifact.zip','candidate.json'],{cwd:dir});
    const zip=fs.readFileSync(path.join(dir,'artifact.zip')); const {github,state}=mock();
    Object.assign(process.env,{POLICY_MODE:'release',PROD_ACCOUNT_ID:'123456789012',AWS_REGION:'eu-central-1'});
    const mergeSHA='f'.repeat(40);let tree=manifest.tree;let main=mergeSHA;
    const paginate=github.paginate;github.paginate=async m=>m==='artifacts'?[{id:1,name:'val-candidate'}]:paginate(m);
    github.rest.actions={getWorkflowRun:async()=>({data:workflow}),listWorkflowRunArtifacts:'artifacts',downloadArtifact:async()=>({data:zip})};
    github.rest.git={getCommit:async()=>({data:{tree:{sha:tree}}})};github.rest.repos.getBranch=async()=>({data:{commit:{sha:main}}});
    const context={repo,payload:{pull_request:{...pr,merged:true,merge_commit_sha:mergeSHA}}};const result={}; const core={setOutput:(k,v)=>result[k]=v};
    await run({github,context,core});assert.equal(result.digest,manifest.digest);
    tree='0'.repeat(40);await assert.rejects(run({github,context,core}),/Merged content/);
    tree=manifest.tree;main='1'.repeat(40);await assert.rejects(run({github,context,core}),/advanced/);
    main=mergeSHA;state.reviews=[];await assert.rejects(run({github,context,core}),/Missing PR approval/);
  } finally {fs.rmSync(dir,{recursive:true,force:true});for(const key of ['POLICY_MODE','PROD_ACCOUNT_ID','AWS_REGION']) {if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
});

test('another service can configure its own branch, status and environment', async () => {
  const saved={...process.env};
  try {
    Object.assign(process.env,{BASE_BRANCH:'master',VALIDATION_BRANCH:'staging',RUN_REFERENCE:'UAT.Run',DEPLOYMENT_ENVIRONMENT:'uat'});
    const {github,state}=mock();
    const custom={...candidate,branch:'staging'};
    const pull={...pr,body:'UAT.Run: 123',base:{...pr.base,ref:'master'},head:{...pr.head,ref:'staging'}};
    state.reviews=[{...review,body:'UAT.Run: 123'}];
    const paginate=github.paginate;
    github.paginate=async (method,args)=>{if(method==='deployments')assert.equal(args.environment,'uat');return paginate(method,args)};
    assert.equal((await verifyPR(github,repo,pull,registry,'',async()=>custom)).sha,sha);
    assert.throws(()=>runId('UATXRun: 123'));
  } finally {for(const key of ['BASE_BRANCH','VALIDATION_BRANCH','RUN_REFERENCE','DEPLOYMENT_ENVIRONMENT']) {if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
});
