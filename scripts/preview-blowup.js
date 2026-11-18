// Renders the blowup GIF locally without Haven: node scripts/preview-blowup.js [image]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { explodeAvatar } from '../src/explode.js';

const input = process.argv[2] ? await readFile(process.argv[2]) : null;
await mkdir('out', { recursive: true });
await writeFile('out/boom.gif', await explodeAvatar(input, 'Havoc'));
console.log('Wrote out/boom.gif');
