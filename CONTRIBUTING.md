# Contributing

Issues and pull requests are welcome. For a bug, please use the
[bug form](https://github.com/firsttris/schreibzeug/issues/new?template=bug_report.yml); for a
rendering or compatibility problem, attach the file that shows it (or a small one that reproduces
it) and say which program made it. For a larger change, open an issue first, so we can agree on the
way before you spend time on it. Security problems go privately, see [SECURITY.md](SECURITY.md).

## Setting up

You need [Bun](https://bun.sh) 1.4 or newer and **Linux x86_64**: preparing the editing engine
(`bun run engine:prepare`, which `bun run dev` runs first) downloads the pinned Euro-Office release
(about 630 MB) and runs its font generator, a Linux x86_64 binary. The preparation unpacks the
release with `ar`, `tar -xJ` and `unzip`; on Debian or Ubuntu they come with `binutils`, `xz-utils`
and `unzip`. On macOS or Windows, work in a Linux VM or container. How to run it, the scripts and
the stack are in [Development](https://firsttris.github.io/schreibzeug/development.html); how the
pieces fit in [Architecture](https://firsttris.github.io/schreibzeug/architecture.html).

## Before a pull request

```sh
bun install --frozen-lockfile
bun run engine:prepare   # once, and after a change in engine/
bun run typecheck        # tsc in every workspace
bun run lint             # Biome (bun run format fixes what it can)
bun run test             # Vitest on Bun: unit and integration tests
bun run test:e2e e2e/<spec>.ts   # Playwright: the specs your change touches; CI runs all of them
bun run build
mkdocs build --strict    # when docs/ or mkdocs.yml changed (pip install -r requirements-docs.txt)
```

When you change the desktop app's Rust code, also run `cargo fmt --check`,
`cargo clippy -- -D warnings` and `cargo test` in `apps/desktop/src-tauri`.

With the change, update what it affects, and only that: the tests, the pages in `docs/` that
describe it, and both READMEs (`README.md` in English, `README.de.md` in German) when something a
user sees is added, changed or removed.

Some conventions:

- Code, comments, docs and commit messages in English; the app's interface in German.
- Written functionally: small pure functions, function components and hooks, no classes, errors
  as values. A file does one thing; split it past about 400 lines.
- Every call into the engine (`sdkjs`) goes through `packages/editor-core` and should name the
  engine source that settles it (e.g. `word/api.js`), since the engine's API is not documented.
- Test files and fonts only if we may redistribute them: fonts under OFL or Apache 2.0, documents
  written by us or under a free license, with their source in `test-files/README.md`.
- No ONLYOFFICE or Euro-Office logos, names or interface assets in the product; icons come from
  lucide.

## License of contributions

Schreibzeug is licensed under the [AGPL-3.0-only](LICENSE), and contributions are accepted under
the same license.

Please sign off every commit (`git commit -s`), which adds a `Signed-off-by:` line with your name
and e-mail address. With it you certify the [Developer Certificate of Origin 1.1](https://developercertificate.org/):
in short, that you wrote the contribution or otherwise have the right to submit it under this
license.

The author also offers Schreibzeug under a commercial license without the AGPL's obligations (see
the README's footer). So that this stays possible, by submitting a contribution you additionally
grant Tristan Teufel a perpetual, worldwide, non-exclusive, royalty-free, irrevocable license to use,
modify and distribute your contribution as part of Schreibzeug under other license terms as well,
including that commercial license. You keep the copyright of your contribution, and it stays
available to everyone under the AGPL-3.0-only.
