const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const text = fs.readFileSync(path.join(__dirname, '../.github/workflows/deploy-ms-validation-release.yml'), 'utf8');
const script = text.match(/          script: \|\n([\s\S]*?)(?=\n  deploy:)/)[1]
  .split('\n').map(line => line.replace(/^            /, '')).join('\n');
const execute = new Function('github', 'context', 'core', 'process', `return (async () => {\n${script}\n})();`);
const commit = 'a'.repeat(40);
async function verify({ version = '0.3.116', branch = 'validazione', release = {}, ref = { object: { type: 'commit', sha: commit } }, tagObject } = {}) {
  const output = {};
  const github = { rest: {
    repos: { getReleaseByTag: async ({ tag }) => { assert.equal(tag, 'v0.3.116'); return { data: release }; } },
    git: { getRef: async () => ({ data: ref }), getTag: async () => ({ data: { object: tagObject } }) },
  } };
  await execute(github, { eventName: 'workflow_dispatch', ref: `refs/heads/${branch}`, repo: { owner: 'org', repo: 'app' } },
    { setOutput: (key, value) => { output[key] = value; } }, { env: { VERSION: version, VALIDATION_BRANCH: 'validazione' } });
  return output;
}
test('accepts a published release version with or without v', async () => {
  for (const version of ['0.3.116', 'v0.3.116']) assert.deepEqual(await verify({ version }), { tag: 'v0.3.116', version: '0.3.116', commit });
});
test('rejects invalid versions, prereleases and other source branches', async () => {
  await assert.rejects(verify({ version: 'latest' }), /release version/);
  await assert.rejects(verify({ release: { prerelease: true } }), /published stable/);
  await assert.rejects(verify({ branch: 'main' }), /validation branch/);
});
test('resolves annotated release tags to the underlying commit', async () => {
  assert.equal((await verify({ ref: { object: { type: 'tag', sha: 'b'.repeat(40) } }, tagObject: { type: 'commit', sha: commit } })).commit, commit);
  await assert.rejects(verify({ ref: { object: { type: 'tree', sha: commit } } }), /point to a commit/);
});
