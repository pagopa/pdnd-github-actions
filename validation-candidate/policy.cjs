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
    deploymentEnvironment: process.env.DEPLOYMENT_ENVIRONMENT || 'val',
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

async function requireApproval(github, repo, pr, candidate) {
  const reviews = await github.paginate(github.rest.pulls.listReviews, { ...repo, pull_number: pr.number });
  const latest = new Map();
  for (const review of reviews) {
    if (['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(review.state) && review.user?.login) {
      latest.set(review.user.login, review);
    }
  }
  const id = String(candidate.run_id);
  const label = configuration().runReference;
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const reference = new RegExp(`^${escaped}:\\s*${id}\\s*$`, 'm');
  assert(![...latest.values()].some(review => review.state === 'CHANGES_REQUESTED'),
    'Pull request has unresolved change requests');
  const eligible = [...latest.values()].filter(review => review.state === 'APPROVED' &&
    review.user.login !== pr.user.login && ['OWNER', 'MEMBER', 'COLLABORATOR'].includes(review.author_association) &&
    review.commit_id === candidate.sha && Date.parse(review.submitted_at) >= Date.parse(candidate.completed_at) &&
    reference.test(review.body || ''));
  for (const review of eligible) {
    const { data } = await github.rest.repos.getCollaboratorPermissionLevel({ ...repo, username: review.user.login });
    if (['admin', 'maintain', 'write'].includes(data.permission)) return;
  }
  assert.fail(`Missing PR approval for candidate ${label}: ${id}`);
}

async function requireCurrentDeployment(github, repo, candidate) {
  const deployments = await github.paginate(github.rest.repos.listDeployments,
    { ...repo, environment: configuration().deploymentEnvironment });
  const latest = deployments.find(d => d.payload?.source === 'validation-candidate/v1');
  assert(latest && latest.sha === candidate.sha && String(latest.payload.run_id) === String(candidate.run_id),
    'VAL no longer runs this exact candidate execution');
  const { data: statuses } = await github.rest.repos.listDeploymentStatuses({ ...repo, deployment_id: latest.id });
  assert(statuses[0]?.state === 'success', 'Latest VAL deployment is incomplete');
}

async function resolveCandidate(github, repo, id, registry) {
  assert(/^[1-9][0-9]*$/.test(String(id)), 'Invalid run ID');
  const { data: workflow } = await github.rest.actions.getWorkflowRun({ ...repo, run_id: id });
  assert.equal(workflow.path, configuration().sourceWorkflow, 'Unexpected source workflow');
  assert.equal(workflow.event, 'workflow_dispatch');
  assert.equal(workflow.conclusion, 'success', 'VAL deploy must succeed');
  assert.equal(workflow.run_attempt, 1, 'Dispatch a new candidate instead of rerunning a workflow');
  assert.equal(workflow.head_repository.full_name, `${repo.owner}/${repo.repo}`);
  assert(Number.isFinite(Date.parse(workflow.updated_at)), 'Missing candidate completion time');
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
    return { ...validateManifest(manifest, workflow, `${repo.owner}/${repo.repo}`, registry), completed_at: workflow.updated_at };
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
  await requireApproval(github, repo, pr, candidate);
  await requireCurrentDeployment(github, repo, candidate);
  if (!pr.merged) {
    const { data: comparison } = await github.rest.repos.compareCommitsWithBasehead({
      ...repo, basehead: `${pr.base.sha}...${pr.head.sha}`
    });
    assert(['ahead', 'identical'].includes(comparison.status), `Merge ${config.baseBranch} into the candidate and repeat validation`);
  }
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
    const candidate = await resolveCandidate(github, repo, process.env.CANDIDATE_RUN_ID, registry);
    const prs = await github.paginate(github.rest.pulls.list, { ...repo, state: 'all', base: config.baseBranch, head: `${repo.owner}:${candidate.branch}` });
    let approved = false;
    for (const pr of prs) {
      if (pr.head.sha !== candidate.sha) continue;
      try {
        if (runId(pr.body) !== String(candidate.run_id)) continue;
        await requireApproval(github, repo, pr, candidate);
        approved = true;
        break;
      } catch { /* Try another PR for the same candidate. */ }
    }
    assert(approved, 'Candidate has no matching approved pull request');
    output(candidate);
    return;
  }
  if (mode === 'record') {
    const state = process.env.DEPLOYMENT_STATE;
    assert(['in_progress', 'success'].includes(state));
    const candidate = JSON.parse(fs.readFileSync(process.env.CANDIDATE_FILE, 'utf8'));
    assert.equal(candidate.repository, `${repo.owner}/${repo.repo}`);
    assert(shaPattern.test(candidate.sha) && digestPattern.test(candidate.digest));
    if (state === 'in_progress') {
      const prs = await github.paginate(github.rest.pulls.list, { ...repo, state: 'open', base: config.baseBranch });
      for (const pr of prs.filter(pr => allowedBranch(pr.head.ref))) {
        await github.rest.repos.createCommitStatus({ ...repo, sha: pr.head.sha, state: 'failure',
          context: config.statusContext, description: 'A new validation deployment is in progress',
          target_url: `${context.serverUrl}/${repo.owner}/${repo.repo}/actions/runs/${context.runId}` });
      }
    }
    const { data: deployment } = await github.rest.repos.createDeployment({ ...repo,
      ref: candidate.sha, environment: config.deploymentEnvironment, auto_merge: false, required_contexts: [],
      production_environment: false,
      description: 'VAL runtime candidate (including rollback)',
      payload: { source: 'validation-candidate/v1', run_id: context.runId, candidate_run_id: candidate.run_id, digest: candidate.digest } });
    assert(deployment.id, 'Could not record runtime candidate');
    await github.rest.repos.createDeploymentStatus({ ...repo, deployment_id: deployment.id,
      state, auto_inactive: state === 'success',
      log_url: `${context.serverUrl}/${repo.owner}/${repo.repo}/actions/runs/${context.runId}` });
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
    const candidate = await verifyPR(github, repo, eventPR, registry, process.env.RELEASE_BOT_LOGIN);
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
