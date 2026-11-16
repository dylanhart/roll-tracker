# Roll Tracker

Tracks each user's d20 rolls in Foundry VTT 13. Existing user statistics are preserved.

## Install

After the first release is published, use this manifest URL in Foundry's Install Module dialog:

https://github.com/dylanhart/roll-tracker/releases/latest/download/module.json

The generated release manifest points to an immutable, versioned release ZIP containing compiled JavaScript, templates, styles, translations, and the license. The repository's `module.json` is a build template, not an install manifest. Existing installations using the raw `main/module.json` URL should switch to the release manifest URL. GitHub source archives are not installable builds.

## Development

Requires Node.js 22.12 or newer.

```sh
git submodule update --init
npm ci
npm run package
npm test
```

`npm run build` runs strict TypeScript checks and builds `dist/`. Copy its contents to Foundry's `Data/modules/roll-tracker/`. `npm run dev` watches source changes and rebuilds the JavaScript; restart the watch build after changing package metadata or static assets. Reload Foundry to load changes.

Source modules separate statistics (`statistics.ts`), queued persistence (`data.ts`), chat filtering (`tracking.ts`), settings, the stats dialog, and player-list buttons. Writes from each client are serialized per user, and all d20s in one message are saved together. Clearing uses the same queue. Tracking does not wait for Dice So Nice animations. Concurrent sessions logged in as the same user are outside this local queue's scope.

Foundry host types come directly from the PF2e submodule at `vendor/pf2e/types/foundry/`, pinned to v13 development commit `81c9e18ffa63583974e827f1f99b75740894c113`. PF2e is licensed under Apache-2.0; see `vendor/pf2e/LICENSE`. CI initializes the submodule automatically. The `src/globals.d.ts` file only connects host globals to those types. No Foundry or type dependencies are bundled into the module. The stats dialog retains Foundry's supported (deprecated) ApplicationV1 implementation.

## Releases

1. Bump the version with `npm version patch --no-git-tag-version` (or `minor`/`major`). `package.json` is the sole version source; npm also updates its lockfile. Do not edit `module.json` for a release.
2. Run `npm run package` and `npm test`. In a Foundry 13 world, check GM/player button visibility, roll tracking, stats, clearing, and printing to chat, including Dice So Nice if enabled.
3. Merge the changes to `main`, then create and push the matching `vVERSION` tag when ready to publish.

The build generates both the manifest version and the versioned download URL from `package.json`. CI validates branch/PR builds and uploads an installable artifact. A matching stable version tag publishes `module.json` and `roll-tracker.zip` as GitHub Release assets. Tagged prerelease versions are rejected; this workflow publishes stable releases only. GitHub selects the latest release automatically by date and version; the workflow does not force older releases to become latest.

The stable manifest URL becomes available after the first successful tagged release. Merging alone does not publish assets. The packager rejects tag/version mismatches and invalid generated manifest metadata.

The ZIP has `module.json` at its root and contains only built runtime files and the license. `release/` and `dist/` are generated and are not committed.
