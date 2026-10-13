# Documentation index

The current prototype uses synthetic One Login, Delegate and mock HMRC, with an About site. For a demonstration, start with the [current demo guide](DEMO_GUIDE.md) and [public briefing](https://about-demo.bathos.org/briefing). For engineering, start with [current behaviour](CURRENT_BEHAVIOUR.md); the original DWP brief is preserved as history.

| Document | Purpose |
|---|---|
| [Agent work guide](AGENT_WORK.md) | Coordinated issue claims, isolated branches and review handoff |
| [Local runtime inventory](LOCAL_RUNTIME.md) | Stack ownership, safe retirement and retained data |
| [CI policy](CI.md) | Local/automatic verification and included-only spending preference |
| [Shared design foundation](DESIGN_SYSTEM.md) | Pinned Bathos release, service theme adapters, checked upgrades and rollback |
| [Current behaviour](CURRENT_BEHAVIOUR.md) | Implemented journeys, integration contract and limitations |
| [Repository status](REPOSITORY_STATUS.md) | Dated local/remote and branch audit, validation and runtime status |
| [Architecture](ARCHITECTURE.md) | Responsibility boundaries and current versus target features |
| [Service catalogues](SERVICE_CATALOGUES.md) | Implemented publication schema, authentication and version rules |
| [Agentic flooding diagrams](AGENTIC_FLOODING.md) | Mermaid flows showing mixed traffic, agent-discovered delegation and trusted versus untrusted lanes |
| [Product case](PRODUCT_CASE.md) | Hypothesis, precedents and inclusion principles |
| [Decisions](DECISIONS.md) | Historical engineering decisions and superseding changes |
| [Decision backlog](DECISION_BACKLOG.md) / [dispositions](DECISION_DISPOSITIONS.md) | Unresolved national questions, owners and reopening triggers |
| [Validation](VALIDATION.md) | Experimental protocol and fair comparator |
| [Evidence](EVIDENCE.md) | Recorded evidence and limits on claims |
| [Observatory research protocol](observatory/RESEARCH_PROTOCOL.md) | Preregistered labels, ground truth and measurement boundaries; actual participant study remains open |
| [Demo guide](DEMO_GUIDE.md) | Canonical routes, three-minute walkthrough, presenter links and defensible claims |
| [Federated authority](FEDERATED_AUTHORITY.md) | Open central/federated/hybrid authority question |
| [Build specification](BUILD_SPEC.md) / [prototype content](PROTOTYPE_CONTENT.md) | Preserved original briefs; superseded examples are not current requirements |

The public About site at https://about-demo.bathos.org/briefing presents these ideas to visitors. The private presenter dashboard is http://localhost:3304; temporary protected research instances are documented in [local runtime inventory](LOCAL_RUNTIME.md). On the private dashboard, `/project-status` explains delivery status, `/how-it-works` describes the implementation, `/delegate-orchestrate` explains the architecture boundary, and `/evidence` distinguishes observations from proof. The root README documents setup, updates and test commands.

## Delivery contracts

- [Consent evidence](CONSENT_EVIDENCE.md): immutable original approval, later history and prototype retention/erasure.
- [Mandate restrictions](MANDATE_CONSTRAINTS.md): bounded service-owned types and enforcement.
- [Independent council service](SECOND_SERVICE.md): service-neutral integration and simulator identity limits.
- [Research feeds](observatory/FEEDS.md), [protected ground truth](observatory/GROUND_TRUTH.md) and [optional Fingerprint sensor](observatory/FINGERPRINT_SENSOR.md): observed coverage is separate from execution truth.
- [Bounded B/C technical comparison](evidence/RUN-20261009-E2-01.md): reproducible outcome parity; no measured human-effort or economic benefit.
