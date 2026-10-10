# Concept briefing

About 10 minutes with demonstration. Prepared 10 October 2026.

Independent synthetic prototype. Original preparation baseline main `6b4f3895f246cfe9e274059c57e4dc1ea7989650`. Status refreshed 10 October 2026: Observatory PRs #109–110 are merged. Dated screenshots/evidence retain their recorded source; vendor validation and genuine participant research remain outstanding.

## 1. Delegate

A person gives an assistant limited permission to deal with government.
The service checks that permission. The person can inspect the activity and remove access.

### Speaker notes

This is an independent prototype using synthetic people and services. An agent here is software that can use a service for someone. The person chooses the assistant. The demo explores the arrangement government could offer, rather than asking government to build everyone's assistant. Allow about ten minutes including the short demonstration.

Sources: [Implemented behaviour at the briefing baseline](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/docs/CURRENT_BEHAVIOUR.md).

## 2. Government already recognises representatives

HMRC has an agent request and client approval journey. Clients can remove that authorisation.
Delegate adapts that relationship to software agents and makes the permission available to participating services.

### Speaker notes

HMRC is the main product precedent. Keep its request, independent approval and removal pattern visible. Existing human representation rules do not by themselves establish the legal status of AI actions. The sources addendum covers other relevant precedents and their limits.

Sources: [HMRC digital handshake](https://www.gov.uk/guidance/how-to-use-the-digital-handshake-to-get-authorised-as-a-tax-agent), [HMRC removal of agent authorisation](https://www.gov.uk/guidance/change-or-remove-your-tax-agents-authorisation), [Government delegated authority guidance](https://www.gov.uk/guidance/delegated-authority-guidance).

## 3. Sam chooses the permission

Sam lets her Personal assistant read her tax code and submit a job-expenses claim.
She leaves employment changes outside the grant. HMRC refuses that attempt.

### Speaker notes

Demo A: use the prepared synthetic approval and action rehearsal described in DEMO_RUNBOOK.md. Show the unchecked consent choices and expiry. The assistant has its own credential and never needs Sam's password. Demonstrate the refusal as well as the successful claim. If using a scripted API client, identify it as scripted.

Sources: [Implemented behaviour at the briefing baseline](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/docs/CURRENT_BEHAVIOUR.md), [Service-defined restrictions](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/docs/MANDATE_CONSTRAINTS.md).

## 4. Sam can inspect and withdraw access

The account shows permission checks and service-reported outcomes.
After Sam removes access, HMRC refuses the next request.

### Speaker notes

Complete Demo A with the account detail and Remove access controls. Show a later refusal with the same client identity. A prior completed action stays in the record. A job durably accepted before removal may still finish. Explain this if someone expects revocation to undo submitted work.

Sources: [Implemented behaviour at the briefing baseline](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/docs/CURRENT_BEHAVIOUR.md).

## 5. More requests can mean different things


| Traffic | Service response |
| --- | --- |
| Repeated attempts for one claim | One claim, with repeat attempts recorded |
| Claims from different people | Separate claims received and recorded |
| Excessive polling or retries | Technical limits and retry guidance |

### Speaker notes

Demo B: run the existing seven-scenario runner at N=10 during rehearsal, then show its actual results. Compare repeated attempts for one person with claims from different people. Read the technical load and claim outcome measures separately. Demo limits are illustrative. HMRC supplies duplicate handling and queue processing in both authority designs.

Sources: [Swarm scenarios and accounting](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/apps/about/src/app/swarm/page.tsx), [Recorded E2 comparison and preserved raw records](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/docs/evidence/RUN-20261009-E2-01.md).

## 6. Authority gives government direct evidence


| Available evidence | Government can establish |
| --- | --- |
| Verified agent and current permission | The registered actor and permitted action |
| Self-declared agent name | What the caller claims |
| Browser or traffic clues | A judgement with uncertainty |

### Speaker notes

A declaration supplies a claimed name. Verification establishes the configured identity or signature, and a live relationship establishes scope. Unknown activity may include legitimate people, assistive technology and agents that cannot integrate. A signed-in human route can still conceal automation. Keep these distinctions separate on screen.

Sources: [Implemented behaviour at the briefing baseline](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/docs/CURRENT_BEHAVIOUR.md), [Architecture and ownership](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/docs/ARCHITECTURE.md).

## 7. Observatory makes the evidence inspectable

The event explorer connects service attempts with recorded authority checks and outcomes.
Comparing several clues may improve understanding. Sensor coverage and recorded predictions stay visible.

### Speaker notes

Demo C uses the merged Observatory dashboard and classifier contract (PRs 110 and 109) in a configured isolated stack. Use the read-only monitoring view first. Ground truth in research view describes audited scripted execution, not an inferred label. Combining clues is the proposed approach; its accuracy still needs testing on varied agents and people. Protected execution labels remain separate from predictions. The current deterministic signature stub reports observed signature evidence. It is not a trained AI detector. Actual vendor validation remains outstanding.

Sources: [Observatory dashboard, PR 110, merged](https://github.com/sighmoan1/govuk-delegate-starter/pull/110), [Blind classifier contract, PR 109, merged](https://github.com/sighmoan1/govuk-delegate-starter/pull/109), [Real vendor validation still outstanding, issue 68](https://github.com/sighmoan1/govuk-delegate-starter/issues/68).

## 8. Independent work appeared alongside this project

Tom Loosemore published WhenIsBins observations on 9 October while Delegate was already underway.
He found variable browser clues and agents choosing APIs. Some named themselves when asked.

### Speaker notes

His small exploratory study is a comparison point. The project chronology comes from the author's account. Compare behaviours on equivalent routes before treating a difference as disagreement. Our test count does not establish broader agent coverage.

Sources: [Tom Loosemore: How Agents Show Up, 9 October 2026](https://loosemore.com/2026/10/09/how-agents-show-up-what-muse-and-other-agents-reveal-when-they-use-whenisbins/), [Existing exploratory route observations](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/apps/about/src/app/which-route/page.tsx).

## 9. The adoption hypothesis

A useful Delegate route could draw most well-behaved agents into identified, authorised activity.
That could substantially reduce Observatory's inference burden and shift effort towards helping people use the route.

### Speaker notes

This is the project's central adoption and operational-burden hypothesis. It remains unmeasured. Tool limitations, service coverage and consent barriers may leave legitimate agents outside. Authorised agents can still malfunction or abuse permission. Measure residual unexplained activity, investigation effort and access failures alongside adoption.

Sources: [Architecture and ownership](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/docs/ARCHITECTURE.md), [Open national decisions](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/docs/DECISION_BACKLOG.md), [Participant pilot proposal, PR 108, awaiting approval](https://github.com/sighmoan1/govuk-delegate-starter/pull/108).

## 10. Evidence so far


| Recorded work | Conclusion supported |
| --- | --- |
| Permission and service regression | Specific synthetic behaviours work |
| Matched service-local / Delegate comparison | Equal outcomes for the fixed workload |
| Scripted ledger replay | Trace collection can be audited |
| Genuine participant research | Still outstanding |

### Speaker notes

The technical comparison used twenty synthetic citizen fixtures across four blocks. Both routes completed all tested legitimate tasks and prevented tested forbidden or duplicate effects. There were no real-agent or human participants in that comparison. Hundreds of checks describe software coverage. They cannot provide a detection accuracy estimate or an adoption rate. Show the preserved evidence if challenged.

Sources: [Recorded E2 comparison and preserved raw records](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/docs/evidence/RUN-20261009-E2-01.md), [Recorded combined validation and manual walkthrough](https://github.com/sighmoan1/govuk-delegate-starter/issues/90#issuecomment-6090819665), [Protected execution ledger](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/docs/observatory/GROUND_TRUTH.md).

## 11. Discussion

Could you use this demonstration to explain delegated agent access to a service team?
Which citizen task would make the next experiment useful, and which department could help test it?

### Speaker notes

Ask the audience to explain the idea in their own words. Record what they find confusing and any precedents we have missed. Seek a bounded service example and relevant product, policy, accessibility and security owners. Offer the detailed briefing for people who want to inspect the design. Do not ask them to endorse a national platform on the basis of this demo.

Sources: [Open national decisions](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/docs/DECISION_BACKLOG.md), [Participant pilot proposal, PR 108, awaiting approval](https://github.com/sighmoan1/govuk-delegate-starter/pull/108).
