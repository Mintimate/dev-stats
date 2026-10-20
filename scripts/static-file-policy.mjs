// Shared by the edge middleware and build checks. Keep this module runtime-neutral.
const privateRoots = new Set([
  'agents', 'cloud-functions', 'edge-functions', 'node_modules',
  'src', 'scripts', 'skills', 'test', 'tests', 'output', 'dist',
]);

export function isPrivatePath(pathname) {
  let path = pathname;
  // Encoded separators and repeated encoding must not bypass the edge guard.
  try {
    for (let i = 0; i < 4 && path.includes('%'); i += 1) {
      path = decodeURIComponent(path);
    }
  } catch {
    return true;
  }
  if (path.includes('%') || /[\x00-\x1f\x7f]/.test(path)) return true;

  const segments = path.replaceAll('\\', '/').split('/').filter(Boolean);
  if (privateRoots.has(segments[0]?.toLowerCase())) return true;
  return segments.some((segment, index) => {
    const name = segment.toLowerCase();
    if (name.startsWith('.') && !(index === 0 && name === '.well-known')) return true;
    return /^(?:package(?:-lock)?\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|edgeone\.json|tsconfig(?:\.[\w-]+)?\.json|vite\.config\.[\w]+|middleware\.[\w]+|agents\.md)$/.test(name)
      || /\.(?:pem|key|p12|pfx|map)$/.test(name);
  });
}
