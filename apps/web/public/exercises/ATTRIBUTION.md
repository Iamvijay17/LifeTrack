# Exercise data and images

Exercise metadata, instructions and start/end demonstration images come from **Free Exercise DB**
(https://github.com/yuhonas/free-exercise-db), pinned at commit `f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5`.

License: **Unlicense** (public domain dedication) — see LICENSE.txt, https://github.com/yuhonas/free-exercise-db/blob/main/LICENSE.md.

The images are served exactly as published upstream (verified by SHA-256 in images.sha256.json). LifeTrack adds only a
category field derived from each exercise's primary muscle and normalised label capitalisation.
Re-import with `node scripts/sync-exercise-db.mjs --refresh`.
