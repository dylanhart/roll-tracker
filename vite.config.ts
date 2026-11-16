import { defineConfig } from 'vite';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('module.json', 'utf8'));
export default defineConfig({
    publicDir: false,
    build: {
        target: 'es2022',
        minify: false,
        lib: { entry: 'src/roll-tracker.ts', formats: ['es'], fileName: () => 'scripts/roll-tracker.js' },
    },
    plugins: [{
        name: 'foundry-assets',
        closeBundle() {
            for (const asset of ['templates', 'styles', 'languages', 'LICENSE.md']) {
                cpSync(asset, `dist/${asset}`, { recursive: true });
            }
            const builtManifest = {
                ...manifest,
                download: `${manifest.url}/releases/download/v${manifest.version}/roll-tracker.zip`,
            };
            writeFileSync('dist/module.json', JSON.stringify(builtManifest, null, 2) + '\n');
            if (manifest.esmodules[0] !== 'scripts/roll-tracker.js') throw new Error('Manifest entry does not match build');
        },
    }],
});
