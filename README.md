# Roll Tracker

Tracks each user's d20 rolls in Foundry VTT 13. Existing user statistics are preserved.

## Install

After the first release is published, use this manifest URL in Foundry's Install Module dialog:

https://github.com/dylanhart/roll-tracker/releases/latest/download/module.json

The root `module.json` stays in the repository so existing installations using the raw `main/module.json` URL can discover the release. The manifest points to a versioned release ZIP containing compiled JavaScript, templates, styles, and translations. GitHub source archives are not installable builds anymore.

## Development

Requires Node.js 22.12 or newer.

```sh
npm ci
npm run package
npm test
```

`npm run build` runs strict TypeScript checks and builds `dist/`. Copy its contents to Foundry's `Data/modules/roll-tracker/`. `npm run dev` watches source changes and rebuilds the JavaScript; rerun the build after changing static assets. Reload Foundry to load changes.

`src/foundry.d.ts` describes the subset of host APIs this module uses; Foundry provides those APIs at runtime. The stats dialog retains Foundry's supported (deprecated) ApplicationV1 implementation.

## Releases

1. Update `version` in `module.json` and `package.json` (refresh `package-lock.json` with `npm install --package-lock-only`). Update `module.json`'s download URL to the matching `vVERSION` tag.
2. Run `npm run package` and `npm test`. In a Foundry 13 world, check GM/player button visibility, roll tracking, stats, clearing, and printing to chat, including Dice So Nice if enabled.
3. Merge the changes to `main`, then create and push the matching `vVERSION` tag when ready to publish.

CI validates branch/PR builds and uploads an installable artifact. A version tag publishes `module.json` and `roll-tracker.zip` as GitHub Release assets and marks the release latest. The packager rejects tag/version or download/version mismatches. Publish only stable releases through this workflow. The stable manifest URL becomes available after the first successful tagged release; merging alone does not publish assets. Coordinate the first merge and tag so the raw manifest does not point to a release that has not been published yet.

The ZIP has `module.json` at its root and contains only built runtime files and the license. `release/` and `dist/` are generated and are not committed.
