# Contributing

Use Node 20 or newer. Install dependencies with `npm ci`, then run `npm run check`. Keep the generated `template.tpl` committed. Native GTM tests and a live browser run are required for changes to the template's import format, permissions, adapter host or execution behavior.

## Releases

1. Update the package and adapter versions, hosted path, changelog and tests as needed.
2. Run the automated tests and generate the template and adapter.
3. Put the adapter at `gtm/v<version>/adapter.js` on the `gh-pages` branch, together with the relevant licenses and checksums. Preserve existing released paths.
4. Verify the served bytes against the built bundle, then import the template in a real GTM container. Run its included tests and a live identification-to-History check.
5. Wait for GitHub CI to pass on the release commit.
6. Tag the commit and create a GitHub release containing `template.tpl`, `adapter.js`, checksums and the package archive.

Use the release template and matching adapter together. Do not replace a published version with behavior changes; release a new version instead.

GitHub releases distribute the manual-import template. npm publication and Google Community Template Gallery submission are separate operations.

## Issues

Include the template version, tag mode, browser, environment and sanitized error code. Never post API keys, authentication cookies or private identification data. Send private support requests to contact@shieldlabs.ai.
