# Forge v0.3.0

> Forge is still in early 0.x development.
> Some workflows and extension interfaces may continue to change.
> This release is recommended for local testing, feedback, and day-to-day exploration rather than production-critical use.

## Highlights

- Added several project-scan and file-read caches so repeated scans, directory listing, file previews, instruction-file reads, ignore matching, full-text index reads, and built-in tool analysis can reuse stable snapshots instead of recomputing every path.
- Expanded the built-in extension ecosystem with more service manifests, product icons, richer authorization copy, and better extension page layout behavior.
- Changed extension credentials to manual token/API-key input by default. Browser OAuth is now an optional maintainer-enabled path behind `FORGE_ENABLE_BROWSER_OAUTH=1`, so ordinary users are not blocked by missing Forge OAuth broker configuration.
- Improved extension OAuth diagnostics by showing the exact maintainer-side environment variable that is missing when browser login is disabled.
- Strengthened agent planning and validation behavior, including larger build-agent plan capacity, write-before-preview guidance, richer validation command inference, and Go validation fallback documentation.
- Added project-level contributor guidance in `AGENTS.md` and kept the future `Forge-site/` static-site folder separate from the Electron package output.

## Verification

- `npm test`
- `npm run release:check`
- `npm run qa:built-in-tools`
- `npm run qa:built-in-tools:browser`
- `npm run dist:win`

Windows installer artifact:

- `release/Forge-0.3.0-x64-setup.exe`
- Size: 104,018,289 bytes
- SHA-256: `2d70874d660fa5ca6d4186e786a53029a02d67bfd2c37b83855f4f2e216b5e7b`

## Known Limitations

- Windows builds are not code-signed yet, so first install may still show system safety prompts.
- Browser OAuth for extensions requires an explicit Forge OAuth broker or provider OAuth app and is disabled by default for this release.
- Existing v0.2.x usability and installer-smoke evidence remains tied to the exact v0.2.x builds that produced it; do not reuse those reports as v0.3.0 evidence.
