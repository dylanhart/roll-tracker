import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { strFromU8, unzipSync } from 'fflate';

test('release ZIP contains runtime assets and the exact standalone manifest', () => {
    const sourceManifest = JSON.parse(readFileSync('module.json', 'utf8'));
    assert.equal(sourceManifest.download, `${sourceManifest.url}/releases/latest/download/roll-tracker.zip`);
    const files = unzipSync(readFileSync('release/roll-tracker.zip'));
    const manifestText = readFileSync('release/module.json', 'utf8');
    assert.equal(strFromU8(files['module.json']), manifestText);
    const manifest = JSON.parse(manifestText);
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    assert.equal(sourceManifest.version, undefined);
    assert.equal(manifest.version, pkg.version);
    assert.ok(!Object.keys(files).some((path) => path.startsWith('types/')));
    for (const path of [
        ...manifest.esmodules,
        ...manifest.styles,
        ...manifest.languages.map((l) => l.path),
        'templates/roll-tracker.hbs',
        'templates/roll-tracker-chat.hbs',
    ])
        assert.ok(files[path], path);
    assert.ok(
        !Object.keys(files).some((path) => path.startsWith('src/') || path.startsWith('node_modules/')),
    );
    assert.equal(
        manifest.manifest,
        'https://github.com/dylanhart/roll-tracker/releases/latest/download/module.json',
    );
    assert.equal(
        manifest.download,
        `https://github.com/dylanhart/roll-tracker/releases/download/v${manifest.version}/roll-tracker.zip`,
    );
});

test('packager refuses a tag that does not match the manifest version', () => {
    const result = spawnSync(process.execPath, ['scripts/package.mjs'], {
        encoding: 'utf8',
        env: { ...process.env, GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v0.0.0' },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Release tag must match module version/);
});

function packageFixture(version, options = {}) {
    const directory = mkdtempSync(join(tmpdir(), 'roll-tracker-package-'));
    const builtVersion = options.builtVersion ?? version;
    const manifest = {
        version: builtVersion,
        download: `https://github.com/dylanhart/roll-tracker/releases/download/v${builtVersion}/roll-tracker.zip`,
        esmodules: ['entry.js'],
        styles: [],
        languages: [],
    };
    mkdirSync(join(directory, 'dist'));
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ version }));
    writeFileSync(join(directory, 'dist/module.json'), JSON.stringify(manifest));
    writeFileSync(join(directory, 'dist/entry.js'), '');
    try {
        return spawnSync(
            process.execPath,
            [fileURLToPath(new URL('../scripts/package.mjs', import.meta.url))],
            {
                cwd: directory,
                encoding: 'utf8',
                env: { ...process.env, GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: `v${version}` },
            },
        );
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
}
test('release packaging accepts stable tags and rejects prereleases', () => {
    const stable = packageFixture('3.2.1');
    assert.equal(stable.status, 0, stable.stderr);
    const prerelease = packageFixture('3.2.1-beta.1');
    assert.notEqual(prerelease.status, 0);
    assert.match(prerelease.stderr, /Only stable versions/);
});
test('release packaging rejects a stale build after changing the package version', () => {
    const result = packageFixture('3.2.1', { builtVersion: '3.2.0' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Built manifest version differs from package.json/);
});
