# Development workflow

## Preferred implementation path

Use the lightest workflow that can complete a task reliably.

- Small and medium, clearly bounded changes should normally be handled directly through ChatGPT/GitHub, including repository inspection, targeted edits, CI review, pull-request work and small safe fixes.
- Codex is no longer the default tool for every development task.
- Use Codex primarily for larger local work packages: broad cross-file changes, substantial refactors, complex state or data-model changes, test-heavy implementation work, or tasks where a local working tree is materially more useful than direct GitHub edits.
- Prefer the smallest capable Codex model. Escalate only when complexity, architecture, security, data integrity, concurrency or integration risk justifies it.
- Before starting a Codex task, synchronize the local repository with the intended GitHub branch and verify the working tree so Codex works from the current state.
- Codex must not commit, push or deploy unless this policy is explicitly changed for a specific task. Review its diff and test results first.
- Keep deployment separate from implementation. Run CI/tests before production changes and use the repository's established guarded deployment path.
- Preserve existing functionality unless the task explicitly requires changing it.

The goal is to save Codex quota and reduce unnecessary local orchestration while still using Codex where its larger working context provides a clear advantage.
