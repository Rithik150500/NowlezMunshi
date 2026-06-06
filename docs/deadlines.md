# Deadlines & limitation

Hearings are not the only dated obligations on a matter — appeals, written statements, reviews and
the like all run on **limitation periods**, and missing one can be fatal to the case. NowLez tracks
these as **deadlines**, computes them with a **limitation calculator**, and surfaces them the same
way it surfaces hearings ("never miss a deadline"). It also turns the caseload into a
**hearing-prep brief** on demand.

## The model

A **Deadline** ([`@nowlez/contracts`](../packages/contracts/src/deadline.ts)) is a NowLez-local
entity (like a [Client](clients.md), [ADR-0018](decisions/0018-deadlines-and-limitation.md)):

| Attribute | Description |
| --- | --- |
| **id** | A generated `DeadlineId` (NowLez-local). |
| **cnr** | The case it belongs to (by CNR — ADR-0001; never changes the case record). |
| **title** | What is due (e.g. "File appeal", "File written statement"). |
| **dueDate** | The due date, `YYYY-MM-DD` — entered directly or **computed** from a rule. |
| **rule** | The limitation-rule id it was computed from, if any. |
| **done** | Whether it has been dealt with (done deadlines drop out of the digest). |

## The limitation calculator

[`@nowlez/tracking`](../packages/tracking/src/deadlines.ts) provides `addDays` and
`computeLimitationDeadline(ruleId, baseDate)` over a **catalogue** of common periods
(`LIMITATION_RULES`):

| Rule | Period |
| --- | --- |
| Appeal to High Court | 90 days |
| Appeal to District Court | 30 days |
| Second appeal (High Court) | 90 days |
| Revision | 90 days |
| Review | 30 days |
| Written statement (CPC; extendable) | 30 days |

> ⚠️ **The catalogue is PROVISIONAL and illustrative — not legal advice.** The real periods, their
> exact triggers, exclusions (e.g. time to obtain a certified copy under §12 of the Limitation Act),
> and condonation all need a **lawyer's sign-off** before any real use. It is one editable table, the
> same "provisional until confirmed" discipline as the [eCourts wire shapes](ecourts-integration.md).

## The deadline digest

`buildDeadlineDigest` is the standing companion to the
[hearing digest](alerts-and-tracking.md#never-miss-a-hearing): it buckets **pending** deadlines
relative to *today* (IST by default) into **overdue / today / tomorrow / this week / later**, sorted
by due date. Exposed at `GET /deadlines`, surfaced as a **Deadlines** section in the web left pane
and `nowlez deadlines` in the CLI.

## The hearing-prep brief

`hearingPrepMessage(cnr)` ([`@nowlez/munshi`](../packages/munshi)) asks the
[Munshi](munshi.md) to prepare the advocate for the next hearing in a case — the matter in brief,
recent orders, the next date, and the points/actions to be ready for — each
[cited](munshi.md#citation-discipline) to its source. It runs through the normal `Munshi.run` loop
(so citation discipline and tools apply), exposed at `POST /cases/:cnr/prep-brief`, `nowlez prep
<cnr>`, and a **Prep brief** button in the web.

## Where deadlines surface

- **HTTP API** — `GET /limitation-rules`, `GET /deadlines` (digest), `GET`/`POST
  /cases/:cnr/deadlines`, `POST /deadlines/:id/done`, `DELETE /deadlines/:id`, and
  `POST /cases/:cnr/prep-brief`.
- **Web** — a **Deadlines** left-pane digest, and per-case deadlines (list, mark done, add by date or
  by rule + base date) plus the **Prep brief** button on the case.
- **CLI** — `deadlines`, `add-deadline`, and `prep`.

## See also

- [ADR-0018](decisions/0018-deadlines-and-limitation.md) — Deadlines as a local entity; the
  provisional limitation catalogue.
- [`alerts-and-tracking.md`](alerts-and-tracking.md) — the hearing digest the deadline digest mirrors.
- [`data-model.md`](data-model.md) — the Deadline entity.
