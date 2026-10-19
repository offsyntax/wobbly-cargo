// audio/src/*.{wav,ogg,mp3} -> public/audio/*.{ogg,mp3}: mono + loudnorm.
// TODO: loop trimming / seamless-loop seam handling.
import { existsSync, readdirSync, mkdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const SRC = 'audio/src', OUT = 'public/audio';
const files = existsSync(SRC) ? readdirSync(SRC).filter((f) => /\.(wav|ogg|mp3)$/i.test(f)) : [];
if (!files.length) { console.log('no audio sources'); process.exit(0); }
mkdirSync(OUT, { recursive: true });
for (const f of files) {
  const base = basename(f, extname(f));
  const common = ['-y', '-loglevel', 'error', '-i', join(SRC, f), '-ac', '1', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11'];
  execFileSync('ffmpeg', [...common, '-c:a', 'libvorbis', '-q:a', '3', join(OUT, `${base}.ogg`)], { stdio: 'inherit' });
  execFileSync('ffmpeg', [...common, '-c:a', 'libmp3lame', '-q:a', '5', join(OUT, `${base}.mp3`)], { stdio: 'inherit' });
  console.log(`audio: ${base}`);
}
