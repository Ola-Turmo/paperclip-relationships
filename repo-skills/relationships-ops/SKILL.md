---
name: relationships-ops
description: Use for relationship-management work involving contacts, birthdays, reconnect cadences, gift planning, family logistics, eldercare check-ins, or conversation memory where the goal is stronger follow-through without turning relationships into a cold CRM.
---

# Relationships Ops

Use this skill for the relationship-focused operating layer in the Personal company.

## Read First

Read these files in order:

1. `PRD.md`
2. `src/manifest.ts`
3. `src/worker.ts`

Then inspect tests when behavior is unclear:

- `tests/`

## What This Repo Owns

This repo owns:

- contact state and reconnect cadence
- interaction history
- birthdays and anniversaries
- gift ideas and occasion planning
- family logistics and eldercare check-ins
- conversation memory and relationship summaries

## Working Rules

- Optimize for warmth and follow-through, not mechanistic volume.
- Suggestions are good; forced automation is not.
- Preserve nuance about closeness, timing, and context.
- Keep family and care-related data respectful and privacy-aware.

## Default Workflow

1. Determine whether the task is memory, remindering, reconnect, gifting, or care logistics.
2. Prefer clear next steps over noisy reminder floods.
3. Keep the contact history coherent so summaries remain trustworthy.
4. If the task touches sensitive family or care issues, escalate ambiguity instead of improvising.

## Expected Outcomes

Good work in this repo should make relationships easier to maintain without making them feel transactional.
