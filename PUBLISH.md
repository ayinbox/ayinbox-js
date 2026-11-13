# Publishing

The package is `ayinbox` on npm. `.github/workflows/release.yml` publishes it when a `v*` tag is pushed, through npm trusted publishing (OIDC) with provenance. No npm token is stored in this repository or in its secrets.

## One-time setup

1. **npm account and organization.** Sign in at https://www.npmjs.com with the account that will own the package, with two-factor authentication on. If the package should belong to an organization, create the `ayinbox` organization there and add the maintainers.

2. **First publish (by hand).** npm only lets you configure a trusted publisher on a package that already exists, so `0.1.0` goes out by hand, from the tagged commit:

   ```bash
   git checkout v0.1.0
   npm ci
   npm run lint && npm test && npm run build
   npm publish --access public
   ```

   If the package belongs to an organization, run `npm access grant read-write ayinbox:developers ayinbox` (or the team you use) afterwards. Because `0.1.0` is then already on npm, the release workflow run for the `v0.1.0` tag fails at `npm publish`; that is expected, and every later tag publishes through the workflow.

3. **Trusted publisher.** On https://www.npmjs.com/package/ayinbox/access, under "Trusted publishing", add a GitHub Actions publisher:
   - Organization or user: `ayinbox`
   - Repository: `ayinbox-js`
   - Workflow filename: `release.yml`
   - Environment: `release`

   Then, under "Publishing access", choose "Require two-factor authentication and disallow tokens". The workflow does not need a token.

4. **GitHub environment.** In this repository, Settings > Environments, create `release`. Optionally restrict it to tags matching `v*` and add required reviewers.

5. **Public repository.** Provenance statements need a public source repository. Make `ayinbox/ayinbox-js` public before the first workflow publish.

6. **JSR (optional).** Create the `@ayinbox` scope on https://jsr.io, create the package `@ayinbox/ayinbox`, and link it to the GitHub repository `ayinbox/ayinbox-js` in the package settings. Then set the repository variable `JSR_PUBLISH` to `true` (Settings > Secrets and variables > Actions > Variables). The `jsr` job publishes with OIDC after npm succeeds.

7. **README.** Once `ayinbox` is on npm, replace the "Not on npm yet" install section with `npm install ayinbox` (plus `pnpm add ayinbox`, `yarn add ayinbox`, `bun add ayinbox`, and `deno add jsr:@ayinbox/ayinbox` if JSR is set up).

## Every release

1. Set the same version in `package.json`, `jsr.json` and `src/version.ts` (`npm run lint` checks they agree), and move the `CHANGELOG.md` entry out of "unreleased".
2. Commit, then tag and push:

   ```bash
   git tag v0.1.1
   git push origin v0.1.1
   ```

The workflow checks that the tag matches the package version, runs the checks and tests, builds, and runs `npm publish --provenance --access public`.
