# Overview

NowLez helps a practising advocate manage their entire caseload in one place and put
an AI assistant on top of it. The product rests on **two pillars**.

## The two pillars

### 1. eCourts integration

A tight integration with **[eCourts](glossary.md#ecourts)**, India's national judicial
data system, so that **case details, court orders, and daily cause lists** flow into the
app automatically rather than being tracked by hand.

The mechanics of this integration — and the deliberate decision to keep the rest of the
system insulated from *where* court data comes from — are covered in
[`ecourts-integration.md`](ecourts-integration.md).

### 2. The Munshi

The **[Munshi](glossary.md#munshi)** — an AI assistant named after the traditional
clerk-scribe who keeps a lawyer's records and prepares drafts — reads everything the user
has and can **answer questions, summarise, and draft documents** with traceable
**citations** back to the source.

The Munshi is detailed in [`munshi.md`](munshi.md).

## Who it's for

The intended user is an **individual advocate or a small firm** operating across:

- **District Courts (DC)**, and
- **High Courts (HC)**.

## The core promise

> The user **adds a case once**, and from then on the system:
> - **tracks it**,
> - **alerts** them to changes,
> - **files documents away with summaries**, and
> - lets them **ask questions or generate drafts** in plain language.

## Scope and boundaries

NowLez is deliberately bounded by the eCourts ecosystem. The clearest expression of this
is in the data model: a **[Case](glossary.md#case)** is keyed solely by its
**[CNR](glossary.md#cnr)**, the unique identifier eCourts assigns to a registered case.

A direct consequence — stated plainly so it is not a surprise during the build:

- The product can represent **only cases that eCourts has already registered**.
- A matter being tracked **before it has a CNR**, or **any forum outside the eCourts/CNR
  system**, falls **outside the data model by design**.

This boundary is consistent with the product's **District Court and High Court** scope.
See [`data-model.md`](data-model.md) and
[ADR-0001](decisions/0001-cnr-as-sole-primary-key.md) for the full reasoning.

## Where to go next

- [`architecture.md`](architecture.md) — how the system is put together.
- [`data-model.md`](data-model.md) — the entities the whole product is built on.
- [`roadmap.md`](roadmap.md) — how we get from this specification to a working product.
