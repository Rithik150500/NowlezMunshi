# Research

Dated, fact-checked research reports that inform the [decisions](../decisions/) and
[open questions](../open-questions.md). Unlike the rest of `docs/` (which captures the agreed
specification), these are **point-in-time investigations** — each is stamped with the date it
was produced and the confidence behind each finding, because the facts (model releases,
pricing, competitor features, legal posture) move.

## Conventions

- **Dated and immutable-ish.** A report reflects what was true on its date. Don't silently
  rewrite history; write a new report (or a follow-up section) when facts change.
- **Confidence is explicit.** Findings carry High / Med / Low confidence and cite a source.
- **Findings flow into decisions.** When a report changes a decision, record it as a dated
  *Research update* section in the relevant [ADR](../decisions/) and/or elevate an
  [open question](../open-questions.md) — don't leave the conclusion stranded here.

## Index

| Date | Report | Covers |
| --- | --- | --- |
| 2026-06-05 | [eCourts access, Gemma models & the Indian legal-tech landscape](2026-06-05-ecourts-gemma-landscape.md) | Feasibility of eCourts data access; Gemma model family/licensing/cost; competitive landscape & gaps |
| 2026-06-05 | [eCourts Services APK — static teardown](2026-06-05-ecourts-apk-teardown.md) | First-hand static analysis of the eCourts mobile app: API surface, CAPTCHA/attestation posture, auth scheme |
