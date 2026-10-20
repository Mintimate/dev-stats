import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

// Never print the bundle, response bodies, runtime errors, or environment values.
// No network access is available to the evaluated edge bundle.
const privatePaths = [
  '/.env', '/.env.local', '/.env.production', '/.ENV',
  '/.env?probe=security', '/nested/.env', '/u/.env',
  '/%2eenv', '/%252eenv', '/%25252eenv', '/%2f.env',
  '/assets%5c.env', '/assets/%2e%2e/.env', '/%ZZ',
  '/.git/config', '/.edgeone/assets/index.html',
  '/package.json', '/package%2ejson', '/package-lock.json',
  '/edgeone.json', '/middleware.js', '/scripts/static-file-policy.mjs',
  '/agents/chat/index.ts', '/cloud-functions/api.go', '/src/main.tsx',
  '/.well-known/.env', '/assets/private.pem', '/assets/index.js.map',
];

const cases = [
  ...privatePaths.map((requestPath) => ({ requestPath, status: 404 })),
  { requestPath: '/.env', method: 'HEAD', status: 404 },
  { requestPath: '/.env', method: 'POST', status: 404 },
  { requestPath: '/', status: 200, originPath: '/' },
  { requestPath: '/favicon.svg', status: 200, originPath: '/favicon.svg' },
  { requestPath: '/assets/app.js', status: 200, originPath: '/assets/app.js' },
  { requestPath: '/.well-known/security.txt', status: 200, originPath: '/.well-known/security.txt' },
  { requestPath: '/api?username=fixture', status: 200, originPath: '/api' },
  { requestPath: '/u/github/fixture', status: 200, originPath: '/index.html' },
];

function check(condition, label) {
  if (!condition) throw new Error(label);
}

async function main() {
  const projectRoot = path.resolve(process.argv[2] || process.cwd());
  let bundle = await fs.readFile(path.join(projectRoot, '.edgeone/edge-functions/index.js'), 'utf8');
  // The platform supplies this side-effect hook module; the VM supplies the
  // equivalent hookCtx.fetch directly to the registered fetch listener.
  bundle = bundle.replace(/^\s*import\s+['"]hooks['"];?\s*/u, '');

  let listener;
  let originRequests = [];
  let runtimeErrors = 0;
  const mockFetch = async (input) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    originRequests.push(url.pathname);
    return new Response('Mock origin', { status: 200, headers: { 'X-Mocked-Origin': '1' } });
  };
  const silentConsole = {
    log() {}, info() {}, debug() {}, warn() {},
    error() { runtimeErrors += 1; },
  };
  const sandbox = {
    URL, URLSearchParams, Request, Response, Headers,
    TextEncoder, TextDecoder, AbortController, AbortSignal,
    ReadableStream, WritableStream, TransformStream,
    Blob, FormData, crypto: webcrypto,
    atob, btoa, structuredClone, queueMicrotask, setTimeout, clearTimeout,
    fetch: mockFetch,
    console: silentConsole,
    caches: { default: { async match() {}, async put() {}, async delete() { return true; } } },
    addEventListener(type, callback) {
      if (type === 'fetch') listener = callback;
    },
  };
  const context = vm.createContext(sandbox, { name: 'dev-stats-production-edge-verification' });
  new vm.Script(bundle, { filename: 'edge-production-bundle.js' }).runInContext(context, { timeout: 5000 });
  check(typeof listener === 'function', 'fetch_listener_missing');

  let failures = 0;
  for (const testCase of cases) {
    const { requestPath, status: expectedStatus, originPath, method = 'GET' } = testCase;
    originRequests = [];
    runtimeErrors = 0;
    let status = 'error';
    let timer;
    try {
      let responsePromise;
      const deferred = [];
      const event = {
        request: new Request(`https://runtime-verification.invalid${requestPath}`, { method }),
        respondWith(response) { responsePromise = Promise.resolve(response); },
        waitUntil(promise) { deferred.push(Promise.resolve(promise)); },
      };
      listener(event, { fetch: mockFetch, async getPathRuntime() { return 'file'; } });
      check(responsePromise, 'response_missing');
      const response = await Promise.race([
        responsePromise,
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('runtime_timeout')), 5000); }),
      ]);
      clearTimeout(timer);
      status = response.status;
      check(status === expectedStatus, 'unexpected_status');
      check(runtimeErrors === 0, 'runtime_error');
      if (expectedStatus === 404) {
        check(response.headers.get('cache-control') === 'no-store', 'missing_no_store');
        check(response.headers.get('x-content-type-options') === 'nosniff', 'missing_nosniff');
        check(originRequests.length === 0, 'private_request_reached_origin');
        check((await response.text()) === 'Not Found', 'unexpected_private_body');
      } else {
        check(response.headers.get('x-mocked-origin') === '1', 'origin_response_missing');
        check(originRequests.length === 1 && originRequests[0] === originPath, 'unexpected_origin_path');
      }
      await Promise.all(deferred);
      console.log(`PASS ${method} ${requestPath} ${status}`);
    } catch {
      clearTimeout(timer);
      failures += 1;
      console.log(`FAIL ${method} ${requestPath} ${status}`);
    }
  }
  console.log(`RESULT ${cases.length - failures}/${cases.length} passed`);
  if (failures) process.exitCode = 1;
}

main().catch(() => {
  console.error('FAIL production bundle verification setup');
  process.exitCode = 1;
});
