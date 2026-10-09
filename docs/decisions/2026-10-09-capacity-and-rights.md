# Decision (prototype principle): regulate processing demand, not citizens' rights

**Recorded:** 9 October 2026  
**Backlog:** [DB-04 / issue #51](https://github.com/sighmoan1/govuk-delegate-starter/issues/51)  
**Status:** **PRINCIPLE AGREED for the independent synthetic GOV.UK Delegate prototype**; detailed service policy and production/legal decisions remain open.  
**Authority:** Project-level product/design principle only. Not departmental policy, legal advice or an approved national service standard.  
**Related implementation:** [Decision 23](../DECISIONS.md) (domain vs throughput vs authority); [#21](https://github.com/sighmoan1/govuk-delegate-starter/issues/21) (durable acceptance/queue); [#22](https://github.com/sighmoan1/govuk-delegate-starter/issues/22) (legitimate surge and duplicates).

## Context

AI agents could greatly increase demand. A surge of 10,000 distinct, properly authorised citizen claims is not equivalent to 10,000 repeated calls for one claim. Suppressing the first to limit request volume would sacrifice genuine citizen access; accepting all of the second as new work would waste capacity and risk duplicate decisions.

The prototype already separates authority, service-specific domain rules and technical throughput. It has synthetic provider/operator, principal and service limits. We need an explicit policy principle to decide what those limits are *for*.

## Agreed principle

> A government service should limit **resource consumption, duplicate work and processing schedules**, without using agent identity or temporary technical congestion to change the citizen's **underlying entitlement, eligibility or procedural rights**. Distinct lawful citizen intents should remain distinguishable and appropriately receivable regardless of whether a human or authorised agent presents them.

Applied to the demo:

1. **Business policy:** The receiving department determines eligibility, whether someone may submit, legally valid filing deadlines, limits on substantive transactions, and review/appeal rights. Delegate does not impose cross-government quotas or decide entitlement.
2. **Technical admission and processing:** Design for **durable receipt of well-formed, validly authorised submissions before asynchronous processing**, with a timestamp, status and receipt that mean exactly what they claim. Queue and schedule fairly across principals and operators, with service-owned published policy where appropriate.
3. **Deduplication:** Retries of an *identical intended operation* should return the existing outcome without repeating the business effect; unrelated people submitting independently must not be deduplicated together. Material new evidence and permitted amendments are new substantive work under the relevant service's rules.
4. **Resource controls:** Services can place proportionate limits on expensive reads, polling, operator fan-out and processing concurrency. A throttle must be identified as temporary, retryable where true, and distinguished from a legal/business refusal. An agent should not obtain more of an individual's legally defined allowance than the individual could themselves.
5. **Failure rather than fiction:** No service may claim a submission was accepted unless it has been durably recorded. If durable acceptance is impossible under overload, communicate that accurately, provide a usable retry/assisted route, and define protection for statutory deadlines under the relevant service's policy; **this principle is not an engineering guarantee of unconditional 24/7 acceptance**.
6. **Citizen access:** Capacity mechanisms must be assessed for accessibility, assisted-digital access, unequal provider effects, deadline-sensitive applications and mistaken refusals.

**Useful thought experiment:** 10,000 distinct citizens submitting in a minute → preserve their opportunities to lodge individual claims and queue processing fairly; one person retrying a single claim 10,000 times → one intended operation, bounded technical work. Whether a particular submitted form is legally received depends on the originating service's rules and the reliability of the acceptance mechanism.

## Alternatives considered

- **Deny new requests above a single per-person/business quota:** rejected as a default overload strategy; may impermissibly mix lawful demand with resource controls. Individual business restrictions still require separate service justification.
- **Make the verified agent route unlimited:** rejected; operator/service resource pressure and abusive traffic can still arise from identified actors.
- **Queue everything without admission protection:** rejected; infinite queues, unavailable dependencies and false “accepted” claims are not safe. Rate controls and realistic fallback remain necessary.

## Consequences and non-conclusions

- Design tests and dashboards around **distinct citizen intents, technical requests, durable admissions, completed operations, business refusals and technical throttles** as separate denominators.
- Do not advertise “fewer claims accepted” or “more requests blocked” as success against flooding.
- Delegate checks do not spend a citizen's substantive service allowance.
- HMRC demo's numerical business limits (e.g. max open cases and changes per 30 days) remain **illustrative**, not validated policy.
- This agreement **does not decide** acceptance-service levels, queue order, exceptional prioritisation, admission caps, deadline law, disability accommodations, published rate schedules or the legality of any particular entitlement restriction.
- This agreement **does not require** that a service spend unlimited resources or complete every request instantly.

## Still open under DB-04

- Which demo business limits should be removed, replaced or independently justified by HMRC policy/legal owners?
- What minimum **durable admission guarantee**, outage handling and proof of filing time should exist for time-critical submissions?
- What queue fairness objective applies across operator, principal, channel and vulnerable/deadline-sensitive requests?
- What measured technical thresholds should apply to reads and polling, and how are the effects reviewed for exclusion?
- How should request retries/backoff and human/assisted fallback work when a service is completely unavailable?

**Next:** progress [#21](https://github.com/sighmoan1/govuk-delegate-starter/issues/21) and [#22](https://github.com/sighmoan1/govuk-delegate-starter/issues/22) as *implementation/evidence work*. Keep [DB-04 #51](https://github.com/sighmoan1/govuk-delegate-starter/issues/51) open as **PARTIALLY DECIDED** until the service-specific policy questions above can be answered. Do not silently substitute coding choices for service policy.
