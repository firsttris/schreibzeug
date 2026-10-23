# Test files

Documents the engine, end-to-end and format-fidelity tests open. Only files we may redistribute
belong here; note each file's source below.

| File | Source | Used by |
|---|---|---|
| `hello.docx` | written by `make.ts` in this folder (AGPL-3.0, like the repository) | `e2e/word-roundtrip.spec.ts` |

Regenerate the generated files with `bun run test-files`.
