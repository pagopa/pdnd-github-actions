const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Execute the actual github-script body used by the reusable workflow.
const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/prepare-ms-validation.yml'), 'utf8');
const script = workflow.match(/          script: \|\n([\s\S]*?)(?=\n  promote:)/)[1]
  .split('\n').map(line => line.replace(/^            /, '')).join('\n');
const execute = new Function('github', 'context', 'core', 'process', `return (async () => {\n${script}\n})();`);
const repo = { owner: 'example', repo: 'service' };
const fullName = `${repo.owner}/${repo.repo}`;
const head = { ref: 'feature/test', sha: 'a'.repeat(40), repo: { full_name: fullName } };
const pr = { number: 12, merged: true, base: { ref: 'validazione' }, head,
  created_at: '2026-01-01T10:00:00Z', merged_at: '2026-01-01T12:00:00Z',
  closed_at: '2026-01-01T12:00:00Z', merge_commit_sha: 'b'.repeat(40) };
const run = { id: 123, head_sha: head.sha, head_branch: head.ref, created_at: '2026-01-01T11:00:00Z',
  status: 'completed', conclusion: 'success', pull_requests: [] };

async function verify({ runs = [run], prs = [pr], jobs = [{ name: 'dev / build-and-deploy-to-dev', conclusion: 'success' }], pull = pr } = {}) {
  const outputs = {};
  const github = {
    rest: { actions: { listWorkflowRuns: 'runs', listJobsForWorkflowRun: 'jobs' }, pulls: { list: 'prs' } },
    paginate: async endpoint => ({ runs, prs, jobs })[endpoint],
  };
  const context = { eventName: 'pull_request', repo, payload: { pull_request: pull, repository: { full_name: fullName } } };
  await execute(github, context, { setOutput: (key, value) => { outputs[key] = value; } },
    { env: { VALIDATION_BRANCH: 'validazione', DEV_WORKFLOW: 'pr-deploy-dev.yml' } });
  return outputs;
}

test('accepts a closed PR when its DEV run no longer lists associated PRs', async () => {
  assert.deepEqual(await verify(), { 'pr-number': '12', 'merge-sha': pr.merge_commit_sha });
});

test('accepts an explicit association with the PR', async () => {
  assert.equal((await verify({ runs: [{ ...run, pull_requests: [{ number: pr.number }] }] }))['pr-number'], '12');
});

test('rejects an ambiguous branch with overlapping PRs', async () => {
  await assert.rejects(verify({ prs: [pr, { ...pr, number: 13 }] }), /unambiguously/);
});

test('rejects a run explicitly associated with another PR', async () => {
  await assert.rejects(verify({ runs: [{ ...run, pull_requests: [{ number: 13 }] }] }), /another PR/);
});

test('rejects failed or stale DEV builds', async () => {
  await assert.rejects(verify({ runs: [{ ...run, conclusion: 'failure' }] }), /must complete successfully/);
  await assert.rejects(verify({ runs: [{ ...run, head_sha: 'c'.repeat(40) }] }), /must complete successfully/);
  await assert.rejects(verify({ runs: [{ ...run, created_at: '2026-01-01T12:01:00Z' }] }), /must complete successfully/);
  await assert.rejects(verify({ jobs: [{ name: 'dev / build-and-deploy-to-dev', conclusion: 'skipped' }] }), /job did not complete/);
});

test('a newer failed run is not hidden by an earlier success', async () => {
  await assert.rejects(verify({ runs: [run, { ...run, id: 124, conclusion: 'failure' }] }), /must complete successfully/);
});
