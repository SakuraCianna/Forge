# Forge v0.2.1

> ⚠️ Forge is currently in early 0.x development.
> Some features may be incomplete, unstable, or subject to breaking changes.
> It is recommended for testing, feedback, and early exploration, not production use yet.

## Highlights

- Improved task-thread routing so a new project request no longer continues from a stopped previous planning flow unless the user explicitly asks to continue.
- Added a "Retry and revert" flow that can resend a previous prompt after reverting file operations with recorded snapshots.
- In Full Access mode, agent-planned ordinary file changes can be applied automatically while high-risk operations still require confirmation.
- Treated user-cancelled agent plan streams as controlled cancellations instead of Electron handler errors.
- Improved previews for common configuration files such as `package.json`, `.env`, `Dockerfile`, and lock/config files.
- Removed the built-in personal development QA sandbox path; QA sandboxes now need to be provided explicitly or by the controlled `.tmp-test` release gate.

## Known Limitations

- Forge remains an early 0.x release and is not recommended for production environments.
- Some workflows, UI behavior, and internal interfaces may change in future versions.
- Formal v0.2.x usability evidence must stay tied to the exact version that was tested; do not reuse older smoke or regression evidence as a newer release claim.
