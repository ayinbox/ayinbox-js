// Fails when package.json, jsr.json and src/version.ts disagree on the version.
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8')).version;
const jsr = JSON.parse(readFileSync('jsr.json', 'utf8')).version;
const src = /VERSION = '([^']+)'/.exec(readFileSync('src/version.ts', 'utf8'))?.[1];
if (pkg !== jsr || pkg !== src) {
  console.error(`version mismatch: package.json ${pkg}, jsr.json ${jsr}, src/version.ts ${src}`);
  process.exit(1);
}
const tag = process.argv[2];
if (tag && tag !== `v${pkg}`) {
  console.error(`tag ${tag} does not match package version ${pkg}`);
  process.exit(1);
}
console.log(`version ${pkg} ok`);
