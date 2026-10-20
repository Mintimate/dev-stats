import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPrivatePath } from './static-file-policy.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

export async function checkAssetDirectory(directory, { edgeone = false } = {}) {
  async function visit(relative = '') {
    const absolute = path.join(directory, relative);
    const stat = await lstat(absolute);
    if (stat.isSymbolicLink()) throw new Error(`Public assets must not contain symlinks: ${relative || directory}`);
    const platformMetadata = edgeone && relative === '.edgeone-assets-config.json';
    if (relative && !platformMetadata && isPrivatePath(`/${relative.split(path.sep).join('/')}`)) {
      throw new Error(`Private file or directory in public assets: ${relative}`);
    }
    if (stat.isDirectory()) {
      for (const name of await readdir(absolute)) await visit(path.join(relative, name));
    } else if (!stat.isFile()) {
      throw new Error(`Unsupported public asset: ${relative}`);
    }
  }
  await visit();
}

async function main() {
  const config = JSON.parse(await readFile(path.join(projectRoot, 'edgeone.json'), 'utf8'));
  if (config.outputDirectory !== 'dist' || config.build?.output !== 'dist') {
    throw new Error('Static output must be dist; never publish the project root.');
  }
  await checkAssetDirectory(path.join(projectRoot, 'public'));
  if (!process.argv.includes('--source-only')) {
    await checkAssetDirectory(path.join(projectRoot, 'dist'));
    const index = await lstat(path.join(projectRoot, 'dist/index.html'));
    if (!index.isFile()) throw new Error('Missing built dist/index.html');
  }
  if (process.argv.includes('--edgeone')) {
    await checkAssetDirectory(path.join(projectRoot, '.edgeone/assets'), { edgeone: true });
    const middleware = JSON.parse(await readFile(path.join(projectRoot, '.edgeone/edge-functions/config.json'), 'utf8'));
    if (!middleware.middleware?.matcher?.some((matcher) => matcher.source === '/:path*')) {
      throw new Error('Deployment must include the security middleware on every route.');
    }
  }
  console.log('Public asset safety checks passed.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
