# Changelog

Generate a CHANGELOG entry from git commits since the last tag (or last N commits).

Usage:
- `/changelog` — since last git tag
- `/changelog 20` — last 20 commits

## Process

1. Find the base:
   - If argument provided: use last $ARGUMENTS commits — `git log -$ARGUMENTS --oneline`
   - Otherwise: find last tag with `git describe --tags --abbrev=0` and use `git log <tag>..HEAD --oneline`
   - If no tags exist: use last 20 commits

2. Group commits by type using conventional commit prefixes:
   - `feat:` / `feature:` → **Added**
   - `fix:` → **Fixed**
   - `refactor:` / `simplify:` → **Changed**
   - `docs:` → **Documentation**
   - `test:` → **Tests**
   - `chore:` / `ci:` → skip (internal)

3. For each commit, write one line: strip the prefix, capitalize first word, keep concise.

4. Output in Keep a Changelog format:

```
## [Unreleased] — YYYY-MM-DD

### Added
- ...

### Fixed
- ...

### Changed
- ...
```

5. Ask: "Добавить это в CHANGELOG.md?"

6. If user confirms, prepend the entry to CHANGELOG.md (create the file if it doesn't exist).

## Constraints

- Today's date for the header
- Skip merge commits and chore/ci commits
- If a commit message is unclear, include it as-is under Changed
