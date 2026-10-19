import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const TOTAL_LIMIT = 5 * 1024 * 1024;
const FILE_LIMIT = 30 * 1024 * 1024;
const root = 'dist';

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

let files;
try {
  files = walk(root);
} catch {
  console.error('dist/ not found; run npm run build first');
  process.exit(1);
}
let total = 0;
const errors = [];
for (const f of files) {
  const size = statSync(f).size;
  total += size;
  if (size >= FILE_LIMIT) errors.push(`file too large: ${f}`);
  if (/\.(gz|br)$/.test(f)) errors.push(`pre-compressed file not allowed: ${f}`);
}
console.log(`dist: ${files.length} files, ${(total / 1024 / 1024).toFixed(2)} MB (limit 5 MB)`);
if (total >= TOTAL_LIMIT) errors.push('total size >= 5 MB');
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
