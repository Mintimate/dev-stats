import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['agents/chat/_tools.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  logLevel: 'silent',
  plugins: [{
    name: 'tool-registration-stub',
    setup(builder) {
      // These tests execute the tool implementation without starting an SDK agent.
      builder.onResolve({ filter: /^@openai\/agents$/ }, () => ({ path: 'sdk', namespace: 'test' }));
      builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const tool = (definition) => definition;' }));
    },
  }],
});
const { executeStatsTool } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const options = { env: { GITHUB_TOKEN: 'synthetic-test-token' } };
const repoUrl = 'https://api.github.com/repos/alice/alice';

test('profile README is returned only after verifying a public repository', async (t) => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push(String(url));
    assert.equal(new Headers(init.headers).get('authorization'), 'token synthetic-test-token');
    if (url === repoUrl) return Response.json({ private: false, visibility: 'public' });
    assert.equal(url, `${repoUrl}/readme`);
    return Response.json({ content: Buffer.from('# Alice 你好').toString('base64'), path: 'README.md' });
  });

  const result = await executeStatsTool('fetch_github_profile_readme', { username: 'alice' }, options);
  assert.equal(result.ok, true);
  assert.equal(result.readme, '# Alice 你好');
  assert.deepEqual(requests, [repoUrl, `${repoUrl}/readme`]);
});

for (const [label, metadata] of [
  ['private', { private: true, visibility: 'private' }],
  ['internal', { private: false, visibility: 'internal' }],
  ['unverified', { visibility: 'public' }],
]) {
  test(`profile README rejects ${label} repository metadata without reading contents`, async (t) => {
    const requests = [];
    t.mock.method(globalThis, 'fetch', async (url) => {
      requests.push(String(url));
      assert.equal(url, repoUrl, 'private repository contents must never be fetched');
      return Response.json({ ...metadata, description: 'PRIVATE_MARKER' });
    });

    const result = await executeStatsTool('fetch_github_profile_readme', { username: 'alice' }, options);
    assert.equal(result.ok, false);
    assert.equal(result.attempts[0].status, 404);
    assert.equal(result.readme, undefined);
    assert.ok(!JSON.stringify(result).includes('PRIVATE_MARKER'));
    assert.deepEqual(requests, [repoUrl]);
  });
}

for (const status of [404, 403, 500]) {
  test(`profile README preserves metadata HTTP ${status} without fetching contents`, async (t) => {
    const requests = [];
    t.mock.method(globalThis, 'fetch', async (url) => {
      requests.push(String(url));
      assert.equal(url, repoUrl);
      return Response.json({ message: 'synthetic failure' }, { status });
    });

    const result = await executeStatsTool('fetch_github_profile_readme', { username: 'alice' }, options);
    assert.equal(result.ok, false);
    assert.equal(result.attempts[0].status, status);
    assert.deepEqual(requests, [repoUrl]);
  });
}

test('profile inspection searches public PRs and excludes private or unverified repositories', async (t) => {
  const repoDetails = {
    'community/public': { private: false, visibility: 'public', description: 'Public work' },
    'company/private': { private: true, visibility: 'private', description: 'PRIVATE_MARKER' },
    'company/internal': { private: false, visibility: 'internal', description: 'PRIVATE_MARKER' },
    'company/unknown': { description: 'PRIVATE_MARKER' },
  };
  let searched = false;
  t.mock.method(globalThis, 'fetch', async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname === '/users/alice') return Response.json({ login: 'alice' });
    if (parsed.pathname === '/users/alice/repos') {
      return Response.json([
        { name: 'public', private: false, visibility: 'public' },
        { name: 'PRIVATE_MARKER', private: true },
        { name: 'PRIVATE_MARKER', private: false, visibility: 'internal' },
        { name: 'PRIVATE_MARKER' },
      ]);
    }
    if (parsed.pathname === '/search/issues') {
      assert.ok(parsed.searchParams.get('q').split(' ').includes('is:public'));
      searched = true;
      // Model a stale search result or unexpectedly broad API response. The
      // repository detail check must still reject non-public contributions.
      return Response.json({ items: Object.keys(repoDetails).map((name) => ({ repository_url: `https://api.github.com/repos/${name}` })) });
    }
    const name = parsed.pathname.replace(/^\/repos\//, '');
    assert.ok(name in repoDetails, `unexpected request: ${url}`);
    return Response.json(repoDetails[name]);
  });

  const result = await executeStatsTool('inspect_github_user', { username: 'alice' }, options);
  assert.equal(searched, true);
  assert.deepEqual(result.repos.map((repo) => repo.name), ['public']);
  assert.deepEqual(result.contributions.map((repo) => repo.name), ['community/public']);
  assert.equal(result.coverage.sampled_repos, 1);
  assert.equal(result.coverage.searched_closed_prs, 1);
  assert.ok(!JSON.stringify(result).includes('PRIVATE_MARKER'));
});
