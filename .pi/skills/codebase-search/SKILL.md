---
name: codebase-search
description: >
  Semantic code search for the SiruBOT repo (open-codebase-index). Use to locate
  unfamiliar code, understand symbols/call paths, or orient before editing.
  Always search before modifying code you are not already familiar with.
---

# Codebase Search Skill

## When to use

The repo is semantically indexed via **open-codebase-index** (`.opencode/index/codebase.db`,
auto-incrementing). Use the semantic tools **before** raw `grep`/glob when you need to
locate unfamiliar code, understand how something works, or find where a symbol is
defined/used. If you do not know this codebase, search it first — do not guess or
edit blind.

## Core rule

> If you are unfamiliar with this codebase (or the area you are about to touch),
> **search it before you edit**. Orient with the semantic tools, read the relevant
> source, then change code. Never infer file/function locations from memory.

## Tools (in order of preference)

- **`codebase_search`** — natural-language chunk search. Best first step to find *what/where*.
- **`codebase_context`** — repo-scale question with cited lines. Use to answer "how does X work" end-to-end.
- **`codebase_edit_context`** — compact pre-edit context for a **known symbol**: target source,
  direct callers/callees. Call before editing a specific function/class.
- **`codebase_peek`** — metadata-only lookup (file, line, name, type) without code content.
- **`implementation_lookup`** / **`find_similar`** — resolve a symbol to its definition, or find
  code resembling a snippet you already have.
- **`architecture_context`** — repository-scale subsystem map; use before deep retrieval when the
  area is completely unfamiliar.
- **`pr_impact`** — what a change set touches (call sites, routes, tests).
- **`call_graph`** / **`call_graph_path`** — callers/callees and the connection path between two symbols.
- **`index_status`** / **`index_health_check`** — verify the index is ready/stale before relying on results.
- **`index_metrics` / `index_logs` / `index_visualize`** — index health diagnostics when results look off.
- **`code_communities`** — discover natural module boundaries and hub symbols.
- **`add_knowledge_base` / `list_knowledge_bases` / `remove_knowledge_base`** — index additional dirs.

Prefer these over `grep` for "where is X" / "how is X wired". Keep `grep`/`glob` for
exact-string or structural lookups the index does not cover.

## How to use

1. **Orient first**: `codebase_search` with a plain-language description of the feature/behavior.
2. **Confirm the index is fresh**: if results look stale or empty, run `index_status`
   (the watcher re-indexes ~10s after edits; large changes may need a manual `/index` or
   `index_codebase` with `force: true`).
3. **Before editing a symbol**: `codebase_edit_context` (or `codebase_context` with `symbol=`)
   to get the authoritative definition + callers/callees.
4. **Trace flows**: `call_graph` / `call_graph_path` to see who calls / what a function calls.

## Configuration

The index config lives at `.opencode/codebase-index.json` (project) and, when absent, falls
back to defaults. Current project config:

```json
{
	"embeddingProvider": "ollama",
	"embeddingModel": "nomic-embed-text",
	"indexing": { "autoIndex": true }
}
```

Full configuration reference (providers, scope, knowledge bases, include/exclude patterns,
search defaults, external reranking, batching):

- **https://github.com/Helweg/open-codebase-index/blob/main/docs/configuration.md**

Key things you may need:

- **Embedding provider** — `embeddingProvider`: `auto` (Ollama → OpenAI → Google), or
  explicit `ollama` / `openai` / `google` / `custom`. Changing the model/provider requires a
  force rebuild (`index_codebase` + `force: true`).
- **Scope** — `scope`: `project` (per-repo) vs `global`.
- **Knowledge bases** — `knowledgeBases: ["../shared-docs"]` to index additional directories
  alongside the repo. A neighboring repo is **not** auto-searched just because it's named in
  the question; add it here.
- **Include/exclude** — `include` / `additionalInclude` / `exclude` globs; opt-in blocked
  paths via `indexing.includeExcluded` / `indexing.includeIgnored`. `.gitignore` is respected.
- **Search defaults** — `search.maxResults`, `minScore`, `hybridWeight`, `fusionStrategy`,
  `contextLines`, `communityBoost`.

## Gotchas

- Results from multiple configured roots carry an **origin label** + repo-relative path.
- After renaming/deleting files, run `index_health_check` to drop stale entries.
- If the index is empty or the provider is unreachable, check `index_status` before
  falling back to `grep`.
