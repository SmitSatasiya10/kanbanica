# Releasing

Everything ships from GitHub. Two workflows do the work, and neither needs a secret you
have to create — the built-in `GITHUB_TOKEN` covers all of it.

| Workflow | Runs on | What it does |
|----------|---------|--------------|
| [`ci.yml`](../.github/workflows/ci.yml) | Pull requests, pushes to `main` | Typecheck, lint (advisory), tests, build |
| [`release.yml`](../.github/workflows/release.yml) | A **successful** `ci.yml` run on `main` | Builds and publishes the image. If the version in `package.json` is new, also creates the tag and the GitHub Release. |

The two never run at the same time. `release.yml` is chained to CI's completion with a
`workflow_run` trigger, so a push to `main` gets CI first, then Release — a red CI
publishes nothing at all.

---

## Cutting a release

There is no manual tagging step. Once CI is green on `main`, `release.yml` reads the
`version` field in `package.json`. If no git tag exists for it yet, that push is a release.

```bash
# 1. Bump the version
$EDITOR package.json          # "version": "0.2.0"

# 2. Write the notes. The section heading must match the version exactly,
#    because its contents become the body of the GitHub Release.
$EDITOR CHANGELOG.md          # ## [0.2.0] - 2026-08-20

# 3. Bring the README's image-tag block along with it.
pnpm docs:sync

# 4. Commit and push. That is the whole release.
git commit -am "Kanbanica 0.2.0"
git push

# 5. Watch it.
gh run watch
```

That single push produces:

- the image, built for `linux/amd64` and `linux/arm64`
- image tags `0.2.0`, `0.2`, `0`, `latest`, `main`, and `sha-<short>`
- the `v0.2.0` git tag
- the GitHub Release, with the matching changelog section as its body

Push to `main` **without** changing the version and you get an ordinary edge build —
`main` and `sha-<short>` only. No tag, no release, `latest` stays where it was.

### Guard rails

The workflow stops before publishing anything if:

- the version is not plain `X.Y.Z`, so a typo can't create a tag that then has to be
  deleted from a public repository
- `CHANGELOG.md` has no `## [<version>]` section — a release with an empty body is
  worse than a failed build

And after publishing, the **Anyone can pull it** job asks `ghcr.io` anonymously, with no
credentials at all, whether a customer could actually pull what was just pushed. It
doesn't block the tag or the release — the image is already published by then — it turns
the run red so a private package is caught here instead of by a self-hoster.

---

## One-time setup: make the package public

This is the step that's easy to miss, because every signal you see looks identical
either way — the build is green, the tags exist, the release is published. A brand-new
GitHub Packages entry is **private**, even in a public repository, so `docker pull`
returns `403` for anyone who isn't signed in until this is done:

1. Repository main page → **Packages** in the right-hand sidebar.
2. Click **kanbanica**.
3. **Package settings → Danger Zone → Change visibility → Public.**

The **Anyone can pull it** job in `release.yml` fails the run until this is done, so
it's no longer something you have to remember to check — but it still has to be done by
hand, once. Check it from a signed-out shell:

```bash
docker logout ghcr.io
docker pull ghcr.io/stack256org/kanbanica:main
```

---

## Keeping the README's image tag in sync

`README.md`'s "Deploying Somewhere Else" section has a generated block (between
`<!-- BEGIN GENERATED: image-tag -->` / `<!-- END GENERATED: image-tag -->`) showing the
`docker pull` command for the current version — regenerated from `package.json` by
`scripts/sync-readme.mjs`, **not** hand-edited. `pnpm docs:sync` writes it,
`pnpm docs:check` fails (no write) if it's out of sync — run the latter in CI if you want
a red build to catch a forgotten `docs:sync` before it merges; that gate isn't wired up
yet, so today it only fails if you run it yourself.

## The published image is the default install path

As of 0.2.0, `docker-compose.yml` references `ghcr.io/stack256org/kanbanica` as an
`image:` — `docker compose up -d` pulls rather than builds, and `IMAGE_TAG` pins a
version. Building from source moved to `docker-compose.build.yml`.

That makes every release a real artifact people deploy, not just a tag, so two things
matter more than they used to:

- **One image covers `app`, `worker` and `migrate`**, differing only in `command:`. There
  is no second image to publish or keep in lockstep — see the Dockerfile header for why
  it ships real source instead of a standalone bundle.
- **`latest` moves on every release.** The README's generated block tells self-hosters to
  pin, but anyone who didn't will be upgraded by a plain `docker compose pull`. Breaking
  deployment changes belong in an `### Upgrade notes` block in the changelog section,
  because that section becomes the GitHub Release body — it's the only place most people
  will read it.

---

## Things that will bite you

- **A new package is private.** Covered above, worth repeating: the build goes green,
  the package page exists, and a self-hoster still gets `denied` pulling it until the
  visibility flag is flipped.
- **Never use bare `github.sha` in `release.yml`.** On a `workflow_run` event it points
  at the head of the default branch, not the commit CI actually tested — under a race it
  would tag and build the wrong commit. Every checkout, the `sha-` image tag, and the
  release `--target` use `github.event.workflow_run.head_sha` instead.
- **Lowercase the image name.** Container registries reject uppercase repository names,
  and `github.repository` preserves whatever case the GitHub org was created with.
  `release.yml` lowercases once into a step output and every consumer reads that.
- **Re-releasing a version does nothing.** Once `v0.2.0` is tagged, pushing again with
  the same `package.json` version produces an edge build and no release. Re-cutting it
  means deleting the tag and the release first — worth avoiding on a public repository.
- **Schema changes need their migration committed.** CI's migrations job fails
  otherwise, because that combination breaks the one-off `migrate` step on every fresh
  install.
