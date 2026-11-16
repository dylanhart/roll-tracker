import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { zipSync } from 'fflate';

const manifest = JSON.parse(readFileSync('dist/module.json', 'utf8'));
const tag = `v${manifest.version}`;
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== tag) {
    throw new Error(`Release tag must match module version: ${tag}`);
}
const expectedDownload = `https://github.com/dylanhart/roll-tracker/releases/download/${tag}/roll-tracker.zip`;
if (manifest.download !== expectedDownload) throw new Error('Built manifest download URL does not match the version');
const files = {};
function collect(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) collect(path);
        else files[relative('dist', path).replaceAll('\\', '/')] = new Uint8Array(readFileSync(path));
    }
}
collect('dist');
for (const path of [...manifest.esmodules, ...manifest.styles, ...manifest.languages.map(language => language.path)]) {
    if (!files[path]) throw new Error(`Missing manifest asset: ${path}`);
}
mkdirSync('release', { recursive: true });
writeFileSync('release/roll-tracker.zip', zipSync(files));
writeFileSync('release/module.json', readFileSync('dist/module.json'));
console.log(`Packaged ${tag}: ${Object.keys(files).length} files`);
