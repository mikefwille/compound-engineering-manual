# Manual invocation policy

This fork sets `disable-model-invocation: true` in every shipped and repository-local skill and `policy.allow_implicit_invocation: false` in each skill's `agents/openai.yaml`.
The helper preserves SKILL.md bodies byte for byte and retains other YAML metadata values.
It also marks the existing ce-help skill catalog rows as manual.
The initial fork shortens the lfg and ce-optimize argument hints and the ce-noslop description to leave room for the new flag within existing size budgets; their instruction bodies are unchanged.

## Maintenance

```sh
bun install --frozen-lockfile
bun run manual:apply
bun run manual:check
```

`manual:apply` is idempotent and discovers newly added skill directories.
`manual:check` makes no edits and exits nonzero when an update would be needed.
The test suite and CI enforce the policy.
After merging an upstream update into the `manual` branch, run these commands, review the diff, and run the normal repository validation gates before publishing.
The `upstream` remote points to EveryInc; `origin` points to this fork.

## Invocation limits

Claude Code also blocks sibling skills from invoking a skill with this opt-out flag.
Chained workflows may stop at a handoff and require you to invoke the next skill explicitly.
The workflow instructions remain upstream's, so they may still describe automatic handoffs.
This fork deliberately changes the invocation policy without rewriting those workflows.
Codex uses its separate implicit-invocation policy; the helper sets both host policies together.
Other hosts are retained from upstream but their automatic invocation behavior is not covered by this fork's guarantee.

The runtime plugin ID stays `compound-engineering` so existing internal references resolve.
Use this fork as a replacement for the upstream plugin rather than enabling both together.
Installation and global configuration changes are separate from maintaining this checkout.
The repository's upstream installation examples still reference upstream; choose this fork explicitly when installing.
