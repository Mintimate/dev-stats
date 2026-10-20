import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { config, middleware } from '../middleware.js';
import { checkAssetDirectory } from '../scripts/check-public-assets.mjs';

function invoke(pathname, method = 'GET') {
  return middleware({
    request: new Request(`https://example.test${pathname}`, { method }),
    next: () => 'next',
    rewrite: (destination) => `rewrite:${destination}`,
  });
}

test('middleware covers static assets and rejects sensitive paths before forwarding', async () => {
  assert.deepEqual(config.matcher, ['/:path*']);
  for (const pathname of [
    '/.env', '/.env.local', '/.env.production?download=1', '/.env.example', '/.ENV',
    '/.git/config', '/.edgeone/project.json', '/assets/.env', '/.well-known/.env',
    '/%2eenv', '/%252eenv', '/%25252eenv', '/assets%2f.env', '/assets%5c.env',
    '/%2e%65nv', '/.env%00', '/%', '/package.json', '/edgeone.json',
    '/agents/chat/index.ts', '/cloud-functions/api.go', '/node_modules/vite/package.json',
    '/src/main.tsx', '/scripts/run-vite-dev.mjs', '/assets/index.js.map', '/server.key',
    '/u/github/.env',
  ]) {
    for (const method of ['GET', 'HEAD', 'POST']) {
      const result = invoke(pathname, method);
      assert.ok(result instanceof Response, `${method} ${pathname} must not be forwarded`);
      assert.equal(result.status, 404, pathname);
      assert.equal(result.headers.get('cache-control'), 'no-store');
      assert.equal(await result.text(), 'Not Found');
    }
  }
});

test('normal pages, APIs, assets and well-known resources retain their routing', () => {
  for (const pathname of [
    '/', '/index.html', '/assets/index-123.js', '/favicon.ico', '/robots.txt', '/sitemap.xml',
    '/chat', '/profile?username=test', '/leaderboard', '/stop', '/api', '/api/top-langs',
    '/.well-known/security.txt', '/.well-known/acme-challenge/abc',
  ]) assert.equal(invoke(pathname), 'next', pathname);
  assert.equal(invoke('/u/github/Mintimate'), 'rewrite:/index.html');
  assert.equal(invoke('/u/cnb/example'), 'rewrite:/index.html');
});

test('asset checks reject hidden files, nested secrets, source maps and symlinks', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dev-stats-security-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'assets'));
  await mkdir(path.join(root, '.well-known'));
  await writeFile(path.join(root, 'index.html'), '<!doctype html>');
  await writeFile(path.join(root, 'assets', 'index.js'), 'console.log("public")');
  await writeFile(path.join(root, '.well-known', 'security.txt'), 'Contact: test');
  await checkAssetDirectory(root);

  for (const relative of ['.env', 'assets/.env.production', 'assets/index.js.map', 'server.pem', 'edgeone.json']) {
    const target = path.join(root, relative);
    await writeFile(target, 'SYNTHETIC_TEST_VALUE=not-a-secret');
    await assert.rejects(checkAssetDirectory(root), /Private file or directory/);
    await rm(target);
  }

  await symlink(path.join(root, 'index.html'), path.join(root, 'linked.html'));
  await assert.rejects(checkAssetDirectory(root), /symlinks/);
  await rm(path.join(root, 'linked.html'));
  const linkedRoot = `${root}-link`;
  await symlink(root, linkedRoot);
  t.after(() => rm(linkedRoot));
  await assert.rejects(checkAssetDirectory(linkedRoot), /symlinks/);
});

test('only the generated EdgeOne asset manifest gets an explicit exception', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dev-stats-artifacts-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, '.edgeone-assets-config.json'), '{}');
  await assert.rejects(checkAssetDirectory(root), /Private file or directory/);
  await checkAssetDirectory(root, { edgeone: true });
  await writeFile(path.join(root, '.env'), 'SYNTHETIC_TEST_VALUE=not-a-secret');
  await assert.rejects(checkAssetDirectory(root, { edgeone: true }), /Private file or directory/);
});
