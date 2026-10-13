# How Delegate changes the agentic flooding problem

> **Status:** Product hypothesis and explanatory diagrams, not evidence of measured flood reduction. This is an independent synthetic prototype, not an official government service.

## The problem: mixed traffic

```mermaid
flowchart TB
  U["Person with a legitimate task"] --> A["Authorised assistant"]
  M["Malicious actor"] --> B["Bot or agent swarm"]
  A --> F["Mixed stream of requests"]
  B --> F
  F --> S["Government service"]
  S --> C["Infer intent from behaviour, content and risk signals"]
  C --> L["Legitimate activity may face friction"]
  C --> R["Abuse can still pass"]
```

A service cannot infer authority merely from an agent's appearance, generated text, request rate or claim of being helpful. Nor is every large increase in legitimate claims an attack.

## The proposed route: independently verifiable authority

```mermaid
flowchart TB
  U["Person: Claim my tax relief"] --> A["Agent finds HMRC's supported integration"]
  A --> D{"Valid authority already recorded?"}
  D -->|No| Q["Agent requests a bounded mandate"]
  Q --> I["Person signs in with One Login"]
  I --> C{"Person approves requested scope?"}
  C -->|No| X["No grant: agent cannot use the authorised route"]
  C -->|Yes| G["Delegate records scope, actor, expiry and consent"]
  D -->|Yes| API["Agent uses HMRC API"]
  G --> API
  API --> V{"HMRC checks authority and service rules"}
  V -->|Pass| P["HMRC processes or queues the claim"]
  V -->|Fail| X
  P --> O["HMRC returns outcome; agent tells person"]
  M["Unidentified or malicious automation"] --> T["Untrusted traffic: ordinary abuse and traffic controls"]
```

**The agent should discover and choose the authorised route without being told to use Delegate by name.** This is a behaviour to test, not something the existence of an API guarantees. Delegate establishes who may act and within what limits; the agent plans the task; HMRC owns the transaction, idempotency, queueing, eligibility and rate limits.

## Before and after

```mermaid
flowchart LR
  subgraph BEFORE["Without a reusable authority signal"]
    L1["Legitimate agents"] --> MIX["Mixed traffic"]
    H1["Hostile automation"] --> MIX
    MIX --> INFER["Infer risk with imperfect signals"]
  end
  subgraph AFTER["With Delegate"]
    L2["Agents with valid mandates"] --> KNOWN["Verifiable, scoped authority"]
    KNOWN --> SERVICE["Service applies domain rules and proportionate controls"]
    H2["Unidentified traffic"] --> UNKNOWN["Untrusted lane with conventional controls"]
  end
```

This **shrinks the ambiguous middle**, rather than stopping the flood. Verified authority is not proof of good intent: fraud, compromised credentials and coercion remain possible. Unidentified traffic is not proof of wrongdoing: legitimate assistive technology and people who cannot use the digital authorisation route must not be excluded.

## What would demonstrate value?

Compare the **same good agent API with service-local delegation** against **that API plus Delegate**. Measure independently authorised activity, route choice without prompting, legitimate completion and user friction, refusal/abuse outcomes, technical load and cost. Do not credit Delegate for effects of queueing, idempotency or API quality. See [validation](VALIDATION.md), [evidence](EVIDENCE.md), [current behaviour](CURRENT_BEHAVIOUR.md) and [architecture](ARCHITECTURE.md).
