# YNAB Repo Improvements

## Objective

Improve the YNAB Automation repo through a GoalBuddy run that prioritizes reliability and safety first, discovers the highest-leverage safe improvements, chooses bounded implementation slices, verifies each slice, and audits whether the broader repo-improvement outcome is complete.

## Original Request

Use GoalBuddy prep. The user selected: "Improve the YNAB Automation repo" and "Local live board."

## Intake Summary

- Input shape: `vague`
- Audience: user, as a non-developer repo owner who wants CTO-style execution and plain-English safety management
- Authority: `requested`
- Proof type: `test`
- Completion proof: tests/checks prove risky YNAB or finance workflows default to dry-run, require explicit approval before live data changes, or otherwise have clear guardrails; completed Worker receipts and a final Judge/PM audit map those checks back to the original reliability/safety outcome.
- Likely misfire: GoalBuddy could do a generic repo cleanup, documentation polish, or broad audit without improving reliability, dry-run confidence, live-finance safety, or automation guardrails.
- Blind spots considered: local untracked work already exists; repo is on `main` ahead of `origin/main`; safety proof should prioritize guardrails over generic cleanup.
- Existing plan facts: use this fresh GoalBuddy board as the working board; do not inspect or reuse another existing goal before starting unless the user changes direction.

## Goal Kind

`open_ended`

## Current Tranche

Discover the highest-leverage reliability and safety improvements for the YNAB Automation repo, complete successive safe verified implementation slices, audit each slice against the original improvement outcome, and keep advancing until the current tranche is complete or a specific blocker requires owner input.

## Non-Negotiable Constraints

- Follow the repo's AGENTS.md Git safety rules before branch, worktree, cleanup, or destructive actions.
- Preserve unrelated local changes and explain branch/worktree state in plain English.
- No live YNAB or bank-data changes without fresh explicit user approval inside the `/goal` run.
- For live finance or YNAB data changes, use evidence-backed reconciliation and dry-run behavior unless the user explicitly approves live writes.
- Use this fresh goal board as the active GoalBuddy board for this tranche.
- Prefer repo-local tools and existing project conventions.
- Do not treat planning, discovery, or a single slice as completion unless a final audit proves the full current tranche is complete.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection if a safe Worker task can be activated.

Do not stop after a single verified Worker slice when the broader owner outcome still has safe local follow-up slices. After each slice audit, advance the board to the next highest-leverage safe Worker task and continue.

Do not stop because a slice needs owner input, credentials, production access, destructive operations, or policy decisions. Mark that exact slice blocked with a receipt, create the smallest safe follow-up or workaround task, and continue all local, non-destructive work that can still move the goal toward the full outcome.

## Canonical Board

Machine truth lives at:

`docs/goals/ynab-repo-improvements/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/ynab-repo-improvements/goal.md.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter.
2. Read `state.yaml`.
3. Run the bundled GoalBuddy update checker when available and mention a newer version without blocking.
4. Re-check the intake: original request, input shape, authority, proof, blind spots, existing plan facts, and likely misfire.
5. Work only on the active board task.
6. Assign Scout, Judge, Worker, or PM according to the task.
7. Write a compact task receipt.
8. Update the board.
9. If Judge selected a safe Worker task with `allowed_files`, `verify`, and `stop_if`, activate it and continue unless blocked.
10. If a problem, suggestion, or follow-up should become a repo artifact, create an approved issue/PR or ask the operator whether to create one.
11. Treat a slice audit as a checkpoint, not completion, unless it explicitly proves the full original user outcome is complete.
12. Finish only with a Judge/PM audit receipt that maps receipts and verification back to the original user outcome and records `full_outcome_complete: true`.

Issue and PR handoffs are supporting artifacts. `state.yaml` remains authoritative, and every external artifact decision must be recorded in a task receipt.
