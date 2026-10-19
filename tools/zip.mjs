// Build, then zip dist/ into release/wobbly-cargo.zip (system zip CLI).
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...opts });
run('npm', ['run', 'build']);
mkdirSync('release', { recursive: true });
const out = resolve('release/wobbly-cargo.zip');
rmSync(out, { force: true });
run('zip', ['-r', '-q', '-X', out, '.'], { cwd: 'dist' });
console.log(`release/wobbly-cargo.zip ${(statSync(out).size / 1024).toFixed(0)} KB`);
