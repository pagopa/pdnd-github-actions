const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { runId, validateManifest, verifyPR, resolveCandidate, run } = require('../validation-candidate/policy.cjs');

const repo = { owner: 'pagopa', repo: 'sample-microservice' };
const fullName = `${repo.owner}/${repo.repo}`;
const sha = 'a'.repeat(40);
const registry = '123456789012.dkr.ecr.eu-central-1.amazonaws.com';
const manifest = { schema: 1, repository: fullName, sha, tree: 'b'.repeat(40), run_id: '123',
  branch: 'validation', digest: `sha256:${'c'.repeat(64)}`, image: `${registry}/${repo.repo}`,
  chart_sha256: 'd'.repeat(64), ticket: 'DLD-1569', companion: 'be:123' };
const workflow = { id: 123, path: '.github/workflows/deploy-ms-validation.yml', event: 'workflow_dispatch',
  conclusion: 'success', run_attempt: 1, head_sha: sha, head_branch: 'validation',
  head_repository: { full_name: fullName } };
const pr = { number: 1, body: 'Test session\nVAL-Run: 123', base: { ref: 'main', sha: 'e'.repeat(40) },
  head: { ref: 'validation', sha, repo: { full_name: fullName } }, user: { login: 'developer' } };
const load = async () => structuredClone(manifest);
const approval = async () => ({ data: [{ state: 'approved', environments: [{ name: 'val-approval' }] }] });
const mock = (status = 'ahead', files = []) => ({
  rest: { repos: { compareCommitsWithBasehead: async () => ({ data: { status } }) }, pulls: { listFiles: 'files' } },
  paginate: async () => files
});

test('require one explicit run ID; reject duplicate or injected references', () => {
  assert.equal(runId('VAL-Run: 123\r\n'), '123');
  for (const body of ['', 'VAL-Run: 0', 'VAL-Run: 123; echo bad', 'VAL-Run: 123\nVAL-Run: 124']) {
    assert.throws(() => runId(body));
  }
});

test('manifest is bound to repository, workflow SHA, branch, image and artifact checksum', () => {
  assert.equal(validateManifest(manifest, workflow, fullName, registry).digest, manifest.digest);
  for (const patch of [{ sha: 'f'.repeat(40) }, { repository: 'attacker/repo' }, { run_id: '124' },
    { digest: 'latest' }, { branch: 'feature/unreviewed' }, { image: 'attacker/image' },
    { chart_sha256: 'bad' }, { tree: 'missing' }, { ticket: '' }]) {
    assert.throws(() => validateManifest({ ...manifest, ...patch }, workflow, fullName, registry));
  }
});

test('accept exact approved candidate including current main', async () => {
  const result = await verifyPR(mock(), repo, pr, registry, 'github-actions[bot]', load);
  assert.equal(result.sha, sha);
});

test('reject stale approval, unrelated feature branch, fork and outdated main', async () => {
  for (const modified of [
    { ...pr, head: { ...pr.head, sha: 'f'.repeat(40) } },
    { ...pr, head: { ...pr.head, ref: 'feature/test' } },
    { ...pr, head: { ...pr.head, repo: { full_name: 'attacker/repo' } } },
    { ...pr, body: 'No approval' }
  ]) await assert.rejects(verifyPR(mock(), repo, modified, registry, '', load));
  await assert.rejects(verifyPR(mock('diverged'), repo, pr, registry, '', load));
});

test('hotfix requires the same approval; branch name is not a bypass', async () => {
  const hotfix = { ...pr, head: { ...pr.head, ref: 'hotfix/DLD-1' } };
  await assert.rejects(verifyPR(mock(), repo, hotfix, registry, '', load));
  assert(await verifyPR(mock(), repo, hotfix, registry, '', async () => ({ ...manifest, branch: hotfix.head.ref })));
});

test('release exception checks bot identity, changed paths and renames', async () => {
  const release = { ...pr, head: { ...pr.head, ref: 'release-please--branches--main' }, user: { login: 'github-actions[bot]' } };
  assert.equal(await verifyPR(mock('ahead', [{ filename: 'version.txt' }]), repo, release, registry, 'github-actions[bot]'), null);
  await assert.rejects(verifyPR(mock('ahead', [{ filename: 'version.txt' }]), repo, release, registry, 'another-bot'));
  await assert.rejects(verifyPR(mock('ahead', [{ filename: 'src/index.js' }]), repo, release, registry, 'github-actions[bot]'));
  await assert.rejects(verifyPR(mock('ahead', [{ filename: 'version.txt', previous_filename: 'src/index.js' }]), repo, release, registry, 'github-actions[bot]'));
});

test('resolve real ZIP artifact and reject failed, rerun or untrusted producer workflows', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'candidate-test-'));
  try {
    fs.writeFileSync(path.join(dir, 'candidate.json'), JSON.stringify(manifest));
    execFileSync('zip', ['-q', 'artifact.zip', 'candidate.json'], { cwd: dir });
    const zip = fs.readFileSync(path.join(dir, 'artifact.zip'));
    let metadata = structuredClone(workflow);
    let artifacts = [{ id: 456, name: 'val-candidate', expired: false }];
    const github = { rest: { actions: {
      getWorkflowRun: async () => ({ data: metadata }), listWorkflowRunArtifacts: 'artifacts',
      downloadArtifact: async () => ({ data: zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) })
    } }, paginate: async () => artifacts, request: approval };
    assert.equal((await resolveCandidate(github, repo, '123', registry)).sha, sha);
    for (const patch of [{ conclusion: 'failure' }, { conclusion: null }, { run_attempt: 2 },
      { path: '.github/workflows/untrusted.yml' }, { event: 'pull_request' },
      { head_repository: { full_name: 'attacker/repo' } }]) {
      metadata = { ...workflow, ...patch };
      await assert.rejects(resolveCandidate(github, repo, '123', registry));
    }
    metadata = workflow;
    github.request = async () => ({ data: [] });
    await assert.rejects(resolveCandidate(github, repo, '123', registry), /functional approval/);
    github.request = approval;
    artifacts = [{ id: 456, name: 'val-candidate', expired: true }];
    await assert.rejects(resolveCandidate(github, repo, '123', registry));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('approval fails if another execution deployed the same SHA or main advanced', async () => {
  process.env.POLICY_MODE = 'approve';
  let runtimeRun = 123;
  let branchSHA = sha;
  let comparison = 'ahead';
  let deploymentState = 'success';
  const context = { repo, ref: 'refs/heads/validation', sha, runId: 123 };
  const github = { rest: { repos: {
    getBranch: async () => ({ data: { commit: { sha: branchSHA } } }),
    compareCommitsWithBasehead: async () => ({ data: { status: comparison } }),
    listDeployments: 'deployments',
    listDeploymentStatuses: async () => ({ data: [{ state: deploymentState }] })
  } }, paginate: async () => [{ id: 1, sha, payload: { run_id: runtimeRun } }], request: approval };
  const core = { summary: { addRaw: () => {}, write: async () => {} } };
  await run({ github, context, core });
  deploymentState = 'in_progress';
  await assert.rejects(run({ github, context, core }), /incomplete/);
  deploymentState = 'success';
  runtimeRun = 124;
  await assert.rejects(run({ github, context, core }), /exact candidate execution/);
  runtimeRun = 123; branchSHA = 'f'.repeat(40);
  await assert.rejects(run({ github, context, core }), /Branch advanced/);
  branchSHA = sha; comparison = 'diverged';
  await assert.rejects(run({ github, context, core }), /current main/);
  delete process.env.POLICY_MODE;
});

test('release rejects a changed merge tree and a main branch advanced after the merge', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-test-'));
  const previousEnv = { ...process.env };
  try {
    fs.writeFileSync(path.join(dir, 'candidate.json'), JSON.stringify(manifest));
    execFileSync('zip', ['-q', 'artifact.zip', 'candidate.json'], { cwd: dir });
    const zip = fs.readFileSync(path.join(dir, 'artifact.zip'));
    process.env.POLICY_MODE = 'release';
    process.env.PROD_ACCOUNT_ID = '123456789012';
    process.env.AWS_REGION = 'eu-central-1';
    const mergeSHA = 'f'.repeat(40);
    let tree = manifest.tree;
    let mainSHA = mergeSHA;
    const github = { request: approval, paginate: async () => [{ id: 456, name: 'val-candidate' }],
      rest: {
        actions: { getWorkflowRun: async () => ({ data: workflow }), listWorkflowRunArtifacts: 'artifacts',
          downloadArtifact: async () => ({ data: zip }) },
        git: { getCommit: async () => ({ data: { tree: { sha: tree } } }) },
        repos: { getBranch: async () => ({ data: { commit: { sha: mainSHA } } }) }
      } };
    const context = { repo, payload: { pull_request: { ...pr, merged: true, merge_commit_sha: mergeSHA } } };
    const outputs = {};
    const core = { setOutput: (key, value) => { outputs[key] = value; } };
    await run({ github, context, core });
    assert.equal(outputs.digest, manifest.digest);
    tree = '0'.repeat(40);
    await assert.rejects(run({ github, context, core }), /Merged content differs/);
    tree = manifest.tree; mainSHA = '1'.repeat(40);
    await assert.rejects(run({ github, context, core }), /main advanced/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    for (const key of ['POLICY_MODE', 'PROD_ACCOUNT_ID', 'AWS_REGION']) {
      if (previousEnv[key] === undefined) delete process.env[key]; else process.env[key] = previousEnv[key];
    }
  }
});

test('synchronization is idempotent and opens main to validation only when needed', async () => {
  process.env.POLICY_MODE = 'sync';
  let ahead = 1;
  let existing = [];
  const created = [];
  const github = { rest: {
    repos: { compareCommitsWithBasehead: async () => ({ data: { ahead_by: ahead } }) },
    pulls: { list: async () => ({ data: existing }), create: async args => created.push(args) }
  } };
  try {
    await run({ github, context: { repo }, core: {} });
    assert.equal(created[0].base, 'validation');
    assert.equal(created[0].head, 'main');
    existing = [{ number: 1 }];
    await run({ github, context: { repo }, core: {} });
    existing = []; ahead = 0;
    await run({ github, context: { repo }, core: {} });
    assert.equal(created.length, 1);
  } finally { delete process.env.POLICY_MODE; }
});

test('independent project config controls provenance, approval, PR status and synchronization', async () => {
  const config = {
    BASE_BRANCH: 'master', VALIDATION_BRANCH: 'staging', HOTFIX_PREFIX: '',
    APPROVAL_ENVIRONMENT: 'uat-review', STATE_ENVIRONMENT: 'uat-state',
    SOURCE_WORKFLOW: '.github/workflows/test-candidate.yml', ARTIFACT_NAME: 'uat-candidate',
    STATUS_CONTEXT: 'osd/promotion', RUN_REFERENCE: 'UAT.Run',
    RELEASE_BOT_LOGIN: 'release-bot', RELEASE_BRANCH_PREFIX: 'release/',
    RELEASE_FILES: '["release.json"]', PROD_ACCOUNT_ID: '123456789012', AWS_REGION: 'eu-central-1'
  };
  const saved = { ...process.env };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'generic-candidate-'));
  try {
    Object.assign(process.env, config);
    const project = { owner: 'example', repo: 'osd-service' };
    const candidate = { ...manifest, repository: 'example/osd-service', branch: 'staging',
      image: `${registry}/osd-service` };
    const producer = { ...workflow, path: config.SOURCE_WORKFLOW, head_branch: 'staging',
      head_repository: { full_name: candidate.repository } };
    const pull = { ...pr, state: 'open', body: 'UAT.Run: 123', base: { ...pr.base, ref: 'master' },
      head: { ...pr.head, ref: 'staging', repo: { full_name: candidate.repository } } };
    fs.writeFileSync(path.join(dir, 'candidate.json'), JSON.stringify(candidate));
    execFileSync('zip', ['-q', 'artifact.zip', 'candidate.json'], { cwd: dir });
    const zip = fs.readFileSync(path.join(dir, 'artifact.zip'));
    const statuses = [];
    const synchronized = [];
    const github = {
      request: async () => ({ data: [{ state: 'approved', environments: [{ name: 'uat-review' }] }] }),
      paginate: async (method, args) => {
        if (method === 'artifacts') return [{ id: 456, name: 'uat-candidate' }];
        if (method === 'files') return [{ filename: 'release.json' }];
        if (method === 'deployments') {
          assert.equal(args.environment, 'uat-state');
          return [{ id: 1, sha, payload: { run_id: 123 } }];
        }
        assert.equal(args.base, 'master'); return [pull];
      },
      rest: {
        actions: { getWorkflowRun: async () => ({ data: producer }), listWorkflowRunArtifacts: 'artifacts',
          downloadArtifact: async () => ({ data: zip }) },
        pulls: { listFiles: 'files', list: async args => {
          assert.equal(args.base, 'staging'); assert.equal(args.head, 'example:master');
          return { data: [] };
        }, create: async args => synchronized.push(args) },
        repos: {
          compareCommitsWithBasehead: async () => ({ data: { status: 'ahead', ahead_by: 1 } }),
          getBranch: async args => { assert.equal(args.branch, 'staging'); return { data: { commit: { sha } } }; },
          listDeployments: 'deployments',
          listDeploymentStatuses: async () => ({ data: [{ state: 'success' }] }),
          createCommitStatus: async args => statuses.push(args)
        }
      }
    };
    const core = { info: () => {}, setFailed: message => assert.fail(message),
      summary: { addRaw: () => {}, write: async () => {} } };
    const context = { repo: project, payload: {}, ref: 'refs/heads/staging', sha, runId: 123, serverUrl: 'https://github.com' };
    assert.equal((await resolveCandidate(github, project, '123', registry)).sha, sha);
    assert.equal(runId('UAT.Run: 123'), '123');
    assert.throws(() => runId('UATXRun: 123')); // The configured label is not a regex.
    process.env.POLICY_MODE = 'policy';
    await run({ github, context, core });
    assert.equal(statuses[0].context, 'osd/promotion');
    assert.equal(statuses[0].state, 'success');
    process.env.POLICY_MODE = 'approve';
    await run({ github, context, core });
    process.env.POLICY_MODE = 'sync';
    await run({ github, context, core });
    assert.equal(synchronized[0].base, 'staging');
    assert.equal(synchronized[0].head, 'master');
    await assert.rejects(verifyPR(github, project, { ...pull, head: { ...pull.head, ref: 'hotfix/issue' } }, registry, '', async () => candidate));
    assert.equal(await verifyPR(github, project, { ...pull, user: { login: 'release-bot' },
      head: { ...pull.head, ref: 'release/1.0' } }, registry, 'release-bot'), null);
    // A different project's approval does not authorize this candidate.
    github.request = approval;
    await assert.rejects(resolveCandidate(github, project, '123', registry), /uat-review/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    for (const key of [...Object.keys(config), 'POLICY_MODE']) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
  }
});
