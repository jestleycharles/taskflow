import { readFile, mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const svgPath = path.join(root, 'public', 'favicon.svg');
const outDir = path.join(root, 'public', 'icons');

const sharp = (await import('sharp')).default;

await mkdir(outDir, { recursive: true });
const svg = await readFile(svgPath);

for (const size of [192, 512]) {
  const buf = await sharp(svg).resize(size, size).png().toBuffer();
  const out = path.join(outDir, `icon-${size}.png`);
  await writeFile(out, buf);
  console.log('Wrote', out);
}
