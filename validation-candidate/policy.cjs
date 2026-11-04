const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const shaPattern = /^[a-f0-9]{40}$/;
const digestPattern = /^sha256:[a-f0-9]{64}$/;

// Defaults follow the shared microservice release conventions. Applications pass
// their branch/environment/review policy explicitly; no project names live here.
function configuration() {
  const config = {
    baseBranch: process.env.BASE_BRANCH || 'main',
    validationBranch: process.env.VALIDATION_BRANCH || 'validation',
    hotfixPrefix: process.env.HOTFIX_PREFIX ?? 'hotfix/',
    approvalEnvironment: process.env.APPROVAL_ENVIRONMENT || 'val-approval',
    stateEnvironment: process.env.STATE_ENVIRONMENT || 'val-state',
    sourceWorkflow: process.env.SOURCE_WORKFLOW || '.github/workflows/deploy-ms-validation.yml',
    artifactName: process.env.ARTIFACT_NAME || 'val-candidate',
    statusContext: process.env.STATUS_CONTEXT || 'validation/promotion-policy',
    runReference: process.env.RUN_REFERENCE || 'VAL-Run',
    releasePrefix: process.env.RELEASE_BRANCH_PREFIX ?? 'release-please--',
    releaseFiles: JSON.parse(process.env.RELEASE_FILES || '["CHANGELOG.md","version.txt",".release-please-manifest.json",".k8s/helm/Chart.yaml",".k8s/helm/env-values/prod.yaml"]'),
  };
  assert(Array.isArray(config.releaseFiles) && config.releaseFiles.every(p => typeof p === 'string'),
    'release-files must be a JSON array of exact paths');
  return config;
}
const allowedBranch = branch => {
  const config = configuration();
  return branch === config.validationBranch || (config.hotfixPrefix !== '' &&
    branch.startsWith(config.hotfixPrefix) && branch.length > config.hotfixPrefix.length);
};

function runId(body) {
  const label = configuration().runReference;
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...(body || '').matchAll(new RegExp(`^${escaped}:\\s*([1-9][0-9]*)\\s*$`, 'gm'))];
  assert.equal(matches.length, 1, `PR body must contain exactly one line: ${label}: <run ID>`);
  return matches[0][1];
}

function validateManifest(manifest, workflow, repository, registry) {
  assert.equal(manifest.schema, 1);
  assert.equal(manifest.repository, repository);
  assert.equal(String(manifest.run_id), String(workflow.id));
  assert.equal(manifest.sha, workflow.head_sha);
  assert.equal(manifest.branch, workflow.head_branch);
  assert(allowedBranch(manifest.branch), 'Candidate branch is not allowed');
  assert(shaPattern.test(manifest.sha) && shaPattern.test(manifest.tree), 'Invalid source identity');
  assert(digestPattern.test(manifest.digest), 'Invalid image digest');
  assert.equal(manifest.image, `${registry}/${repository.split('/')[1]}`);
  assert(/^[a-f0-9]{64}$/.test(manifest.chart_sha256), 'Invalid chart checksum');
  assert(typeof manifest.ticket === 'string', 'Invalid test reference');
  return manifest;
}

async function requireApproval(github, repo, id) {
  const { data: reviews } = await github.request('GET /repos/{owner}/{repo}/actions/runs/{run_id}/approvals',
    { ...repo, run_id: id });
  assert(reviews.some(review => review.state === 'approved' &&
    review.environments.some(environment => environment.name === configuration().approvalEnvironment)),
  `Missing explicit functional approval for the ${configuration().approvalEnvironment} environment`);
}

async function resolveCandidate(github, repo, id, registry) {
  assert(/^[1-9][0-9]*$/.test(String(id)), 'Invalid run ID');
  const { data: workflow } = await github.rest.actions.getWorkflowRun({ ...repo, run_id: id });
  assert.equal(workflow.path, configuration().sourceWorkflow, 'Unexpected source workflow');
  assert.equal(workflow.event, 'workflow_dispatch');
  assert.equal(workflow.conclusion, 'success', 'VAL deploy and functional approval must both succeed');
  assert.equal(workflow.run_attempt, 1, 'Dispatch a new candidate instead of rerunning a workflow');
  assert.equal(workflow.head_repository.full_name, `${repo.owner}/${repo.repo}`);
  await requireApproval(github, repo, id);
  const artifacts = await github.paginate(github.rest.actions.listWorkflowRunArtifacts, { ...repo, run_id: id });
  const candidates = artifacts.filter(a => a.name === configuration().artifactName && !a.expired);
  assert.equal(candidates.length, 1, 'Candidate artifact missing or expired');
  const { data: zip } = await github.rest.actions.downloadArtifact({
    ...repo, artifact_id: candidates[0].id, archive_format: 'zip'
  });
  // The authenticated Octokit request follows GitHub's signed download redirect.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'val-candidate-'));
  try {
    const archive = path.join(dir, 'artifact.zip');
    fs.writeFileSync(archive, Buffer.from(zip));
    const manifest = JSON.parse(execFileSync('unzip', ['-p', archive, 'candidate.json'],
      { encoding: 'utf8', maxBuffer: 64 * 1024 }));
    return validateManifest(manifest, workflow, `${repo.owner}/${repo.repo}`, registry);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function verifyPR(github, repo, pr, registry, bot, loadCandidate = resolveCandidate) {
  const config = configuration();
  assert.equal(pr.base.ref, config.baseBranch);
  assert.equal(pr.head.repo.full_name, `${repo.owner}/${repo.repo}`, 'Forks cannot promote');
  if (config.releasePrefix && pr.head.ref.startsWith(config.releasePrefix)) {
    assert(bot && pr.user.login === bot, 'Release PR must be authored by the configured release bot');
    const files = await github.paginate(github.rest.pulls.listFiles, { ...repo, pull_number: pr.number });
    assert(files.length > 0 && files.every(f => config.releaseFiles.includes(f.filename) && !f.previous_filename),
      'Release automation may only change release metadata');
    return null;
  }
  assert(allowedBranch(pr.head.ref), 'Only the validation branch, approved hotfixes and release automation may merge');
  const candidate = await loadCandidate(github, repo, runId(pr.body), registry);
  assert.equal(candidate.sha, pr.head.sha, 'PR changed after VAL approval');
  assert.equal(candidate.branch, pr.head.ref);
  const { data: comparison } = await github.rest.repos.compareCommitsWithBasehead({
    ...repo, basehead: `${pr.base.sha}...${pr.head.sha}`
  });
  assert(['ahead', 'identical'].includes(comparison.status), `Merge ${config.baseBranch} into the candidate and repeat validation`);
  return candidate;
}

async function run({ github, context, core }) {
  const repo = context.repo;
  const config = configuration();
  const registry = `${process.env.PROD_ACCOUNT_ID}.dkr.ecr.${process.env.AWS_REGION}.amazonaws.com`;
  const mode = process.env.POLICY_MODE;
  const output = candidate => {
    core.setOutput('digest', candidate.digest);
    core.setOutput('source-sha', candidate.sha);
    core.setOutput('run-id', String(candidate.run_id));
  };
  if (mode === 'candidate') {
    output(await resolveCandidate(github, repo, process.env.CANDIDATE_RUN_ID, registry));
    return;
  }
  if (mode === 'record') {
    const state = process.env.DEPLOYMENT_STATE;
    assert(['in_progress', 'success'].includes(state));
    const candidate = JSON.parse(fs.readFileSync(process.env.CANDIDATE_FILE, 'utf8'));
    assert.equal(candidate.repository, `${repo.owner}/${repo.repo}`);
    assert(shaPattern.test(candidate.sha) && digestPattern.test(candidate.digest));
    const { data: deployment } = await github.rest.repos.createDeployment({ ...repo,
      ref: candidate.sha, environment: config.stateEnvironment, auto_merge: false, required_contexts: [],
      production_environment: false,
      description: 'VAL runtime candidate (including rollback)',
      payload: { run_id: context.runId, candidate_run_id: candidate.run_id, digest: candidate.digest } });
    assert(deployment.id, 'Could not record runtime candidate');
    await github.rest.repos.createDeploymentStatus({ ...repo, deployment_id: deployment.id,
      state, auto_inactive: state === 'success',
      log_url: `${context.serverUrl}/${repo.owner}/${repo.repo}/actions/runs/${context.runId}` });
    return;
  }
  if (mode === 'approve') {
    await requireApproval(github, repo, context.runId);
    const branch = context.ref.replace('refs/heads/', '');
    assert(allowedBranch(branch) && context.ref.startsWith('refs/heads/'));
    const { data: head } = await github.rest.repos.getBranch({ ...repo, branch });
    assert.equal(head.commit.sha, context.sha, 'Branch advanced; deploy and approve a new candidate');
    const { data: comparison } = await github.rest.repos.compareCommitsWithBasehead({
      ...repo, basehead: `${config.baseBranch}...${context.sha}`
    });
    assert(['ahead', 'identical'].includes(comparison.status), `Candidate must include current ${config.baseBranch}`);
    // Approval is separate from deploy. Reject a candidate superseded by another deployment/rollback.
    const deployments = await github.paginate(github.rest.repos.listDeployments, { ...repo, environment: config.stateEnvironment });
    const latest = deployments[0];
    assert(latest && latest.sha === context.sha && String(latest.payload.run_id) === String(context.runId),
      'VAL no longer runs this exact candidate execution');
    const { data: statuses } = await github.rest.repos.listDeploymentStatuses({ ...repo, deployment_id: latest.id });
    assert(statuses[0]?.state === 'success', 'Latest VAL deployment is incomplete; redeploy before approval');
    core.summary.addRaw(`Functional approval for ${context.sha}, run ${context.runId}.`);
    await core.summary.write();
    return;
  }
  if (mode === 'sync') {
    const { data: comparison } = await github.rest.repos.compareCommitsWithBasehead({
      ...repo, basehead: `${config.validationBranch}...${config.baseBranch}`
    });
    if (comparison.ahead_by === 0) return;
    const { data: prs } = await github.rest.pulls.list({ ...repo, state: 'open', base: config.validationBranch, head: `${repo.owner}:${config.baseBranch}` });
    if (!prs.length) await github.rest.pulls.create({ ...repo, base: config.validationBranch, head: config.baseBranch,
      title: `chore: synchronize ${config.baseBranch} into ${config.validationBranch}`,
      body: 'Bring release metadata and hotfixes into the validation branch before the next candidate. Resolve conflicts through review; use a merge commit.' });
    return;
  }
  if (mode === 'release') {
    const eventPR = context.payload.pull_request;
    assert(eventPR && eventPR.merged && allowedBranch(eventPR.head.ref));
    assert.equal(eventPR.base.ref, config.baseBranch);
    assert.equal(eventPR.head.repo.full_name, `${repo.owner}/${repo.repo}`);
    const candidate = await resolveCandidate(github, repo, runId(eventPR.body), registry);
    assert.equal(candidate.sha, eventPR.head.sha);
    assert.equal(candidate.branch, eventPR.head.ref);
    const { data: merged } = await github.rest.git.getCommit({ ...repo, commit_sha: eventPR.merge_commit_sha });
    assert.equal(merged.tree.sha, candidate.tree, 'Merged content differs from the validated candidate');
    const { data: main } = await github.rest.repos.getBranch({ ...repo, branch: config.baseBranch });
    assert.equal(main.commit.sha, eventPR.merge_commit_sha, `${config.baseBranch} advanced; do not release an obsolete candidate`);
    output(candidate);
    return;
  }
  assert.equal(mode, 'policy');
  let prs;
  if (context.payload.pull_request) {
    prs = [(await github.rest.pulls.get({ ...repo, pull_number: context.payload.pull_request.number })).data];
  } else {
    prs = await github.paginate(github.rest.pulls.list, { ...repo, state: 'open', base: config.baseBranch });
  }
  let failed = false;
  for (const pr of prs.filter(p => p.state === 'open' && p.base.ref === config.baseBranch)) {
    let state = 'success';
    let description = 'Validated candidate or authorized release metadata';
    try { await verifyPR(github, repo, pr, registry, process.env.RELEASE_BOT_LOGIN); }
    catch (error) { state = 'failure'; description = error.message; failed = true; }
    await github.rest.repos.createCommitStatus({ ...repo, sha: pr.head.sha, state, context: config.statusContext,
      description: description.slice(0, 140), target_url: `${context.serverUrl}/${repo.owner}/${repo.repo}/actions/runs/${context.runId}` });
    core.info(`#${pr.number}: ${description}`);
  }
  if (failed) core.setFailed('One or more promotion PRs did not satisfy the policy');
}

module.exports = { run, runId, allowedBranch, validateManifest, verifyPR, resolveCandidate };
