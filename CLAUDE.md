# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

Greenfield. No source code, build system, dependencies, or tests have been committed yet. When a task implies existing structure (e.g. "update the build script"), confirm with the user rather than inventing one.

**Read [REQUIREMENTS.md](REQUIREMENTS.md) first.** It is the distilled source of truth for what is being built, the non-negotiables, and evaluation priorities. The raw source is the assignment PDF ([Requirement- twin mind.pdf](Requirement- twin mind.pdf)).

## Spec-driven workflow

New features start as a markdown spec under [_specs/](_specs/), created via the `/spec <short idea>` slash command (defined in [.claude/commands/spec.md](.claude/commands/spec.md)). The command:

1. Aborts if the working tree is dirty — commit or stash first.
2. Derives a kebab-case `feature_slug` (≤40 chars, `a-z0-9-` only) and Title Case `feature_title` from the user's short idea.
3. Switches to a new branch `claude/feature/<feature_slug>` (appending `-01`, `-02`, … if taken).
4. Writes `_specs/<feature_slug>.md` using [_specs/template.md](_specs/template.md) verbatim — no code examples in the spec.

The template's sections (Summary, Functional Requirements, Figma Design Reference, Possible Edge Cases, Acceptance Criteria, Open Questions, Testing Guidelines) are the contract Plan mode consumes downstream. Preserve them when editing specs.

## Conventions

- **Branch naming:** `claude/feature/<feature-slug>` for feature work. Do not commit directly to `main`.
- **Tests location:** The spec template instructs feature tests to live under `./tests/` — create that directory when the first feature lands rather than colocating tests.
- **Spec edits:** Keep specs free of implementation detail (code snippets, file paths, API signatures). Those belong in the plan or the code itself.
