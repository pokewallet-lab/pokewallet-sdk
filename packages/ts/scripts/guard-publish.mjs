// Runs as part of `prepublishOnly`. Publishing is the job of the release workflow
// (tag ts-v<version>, protected "release" environment); anything else is refused.
const env = process.env
const dryRun = env.npm_config_dry_run === 'true'
const fromReleaseTag = env.GITHUB_ACTIONS === 'true' && /^refs\/tags\/ts-v\d+\.\d+\.\d+/.test(env.GITHUB_REF ?? '')

if (!dryRun && !fromReleaseTag) {
  console.error('Refusing to publish: @pokewallet/sdk is published only by the release workflow, from a ts-v<version> tag.')
  console.error('A dry run (npm publish --dry-run) is always allowed.')
  process.exit(1)
}
