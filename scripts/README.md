# Version Management Scripts

## Manual Version Bumping

Use `bump-version.sh` to manually update the version:

```bash
./scripts/bump-version.sh patch   # Bug fixes: 0.1.0 → 0.1.1
./scripts/bump-version.sh minor   # New features: 0.1.0 → 0.2.0
./scripts/bump-version.sh major   # Breaking changes: 0.1.0 → 1.0.0
```

**What it does:**
1. Updates `manifest.json`, `package.json`, and `versions.json`
2. Shows you the changes
3. Gives you next steps to commit and tag

**Then:**
1. Review changes: `git diff`
2. Create PR with the version bump
3. After PR is merged: `git tag X.Y.Z && git push origin X.Y.Z`
4. GitHub Actions builds and creates the release

## Automated Version Bumping (via PR labels)

The `.github/workflows/auto-release.yml` workflow uses [anothrNick/github-tag-action](https://github.com/anothrNick/github-tag-action) to automatically create versions and tags when PRs are merged to main.

### How to use:

1. **Label your PR** with one of:
   - `patch` - Bug fixes, small improvements
   - `minor` - New features
   - `major` - Breaking changes
   
2. **Merge the PR**

3. **Auto-release workflow runs**:
   - Detects label
   - Bumps version accordingly
   - Updates manifest.json, package.json, versions.json
   - Commits the bump
   - Creates and pushes the tag
   - Release workflow triggers automatically

### Examples:

- PR with label `patch`: 0.1.0 → 0.1.1
- PR with label `minor`: 0.1.0 → 0.2.0
- PR with label `major`: 0.1.0 → 1.0.0
- PR with no label: defaults to `patch`

## Semantic Versioning Guide

### PATCH (0.1.X)
- Bug fixes
- Performance improvements
- Documentation updates
- Code cleanup
- Test improvements

### MINOR (0.X.0)
- New tools added
- New features
- New commands
- Backwards compatible changes

### MAJOR (X.0.0)
- Breaking changes
- API redesign
- Major feature overhaul
- Plugin architecture changes

## Current Workflow

1. Create feature branch
2. Make changes
3. Create PR with appropriate label (`patch`, `minor`, or `major`)
4. Review and merge PR
5. Auto-release workflow bumps version and creates tag
6. Release workflow builds and publishes

## Manual Override

If you want to skip auto-versioning for a PR:
- Don't add any version labels
- The workflow will default to patch bump
- Or merge with label `skip-release` (you'll need to add this to the workflow)

