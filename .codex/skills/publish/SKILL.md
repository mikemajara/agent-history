---
name: publish
description: Prepare, release, and verify this npm package. Use when a user asks to publish or release agent-history, test the release pipeline, bump the npm version, create a GitHub release, or verify a completed npm release.
---

# Publish

Prepare and verify a release, then leave the final npm publication to the user so they can supply the one-time password.

## Pre-release

1. Read `package.json`, `.github/workflows/publish.yml`, and release notes in `README.md`.
2. Check `git status`, current branch, and whether the target version/tag already exists locally, on GitHub, or on npm.
3. Confirm prerequisites without exposing secrets:
   - `npm whoami` succeeds.
   - `gh auth status` has access to the repository.
4. Run `npm test` and `npm pack --dry-run`. Inspect the tarball file list; it must contain the CLI, source, README, and license, but no tests, local data, or secrets.
5. Run `npm publish --dry-run --access public`. Treat this as validation only.

Stop and report any failed prerequisite. Do not bump a version, push, publish, tag, or create a release until the user explicitly approves the target version and release.

## Release

1. Bump `package.json` and `package-lock.json` to the approved SemVer version with `npm version <version> --no-git-tag-version`.
2. Re-run the pre-release checks, commit the version change, and push `main`.
3. Give the user the final command and wait for them to run it:

   ```bash
   npm publish --otp XXXXXX
   ```

Do not run the non-dry-run publish command or create the GitHub release before npm confirms that the version was published.

## Post-release

1. Confirm the registry version:

   ```bash
   npm view agent-history version
   npx agent-history@<version> --version
   ```

2. Create the matching GitHub release after registry verification:

   ```bash
   gh release create v<version> --target main --generate-notes --title v<version>
   ```

3. Watch the `Verify npm release` workflow and report the release URL, package version, and workflow result. If publication fails, diagnose it before creating a release.
