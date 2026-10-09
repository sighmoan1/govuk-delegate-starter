# Precedents and evidence

## Government representation precedents

HMRC's digital handshake is the main product precedent: a tax agent sends a request and the client authorises access. HMRC also provides removal of agent authorisation and prohibits sharing client credentials. Delegate follows that lifecycle with separate software identity and scoped permission.

Sources: [HMRC request journey](https://www.gov.uk/guidance/how-to-use-the-digital-handshake-to-get-authorised-as-a-tax-agent) and [removing authorisation](https://www.gov.uk/guidance/change-or-remove-your-tax-agents-authorisation), checked 10 October 2026. This is a product-pattern comparison, not a claim that an AI system can register as a tax agent under existing arrangements.

Government delegated authority guidance describes the subject, representative, permission and evidence of when authority was given. It also covers conditions and checking representative identity separately. Its audience is organisations certified against the digital identity and attributes trust framework. The prototype uses these concepts without claiming certification or conformity.

Source: [Delegated authority guidance](https://www.gov.uk/guidance/delegated-authority-guidance), checked 10 October 2026.

Universal Credit explicit consent supports access to specified information for a representative and a purpose. Written authority for making and managing a claim is a distinct arrangement. This offers a consent precedent, rather than a general software transaction permission.

Source: [Get help with your Universal Credit claim](https://www.gov.uk/guidance/get-help-with-your-universal-credit-claim), checked 10 October 2026.

Use an LPA provides a digital way for organisations to check an existing legal appointment, its validity and relevant instructions. The access code exposes evidence of that appointment. It does not create an LPA or confer authority on software. This matters for a future design that consumes authority from other issuers.

Source: [Use an LPA and View an LPA](https://www.gov.uk/guidance/using-the-donors-lpa-access-codes-and-view-an-lpa), checked 10 October 2026.

These precedents support the relationship model. Departments still need to determine which software-mediated acts they can recognise and who bears responsibility.

## Tom Loosemore's contemporaneous work

Tom published [How Agents Show Up](https://loosemore.com/2026/10/09/how-agents-show-up-what-muse-and-other-agents-reveal-when-they-use-whenisbins/) on 9 October 2026. Delegate was already underway, according to its author. The article offers independently gathered observations alongside this project, with a small sample and explicit limits. Its reported variation in browser clues and route choice is consistent with keeping several evidence sources and recording unknowns. Our prototype has not reproduced all its agent/device combinations. There is no established contradictory detection result here.

## Evidence categories for the briefing

| Category | Actual evidence | Claim supported |
| --- | --- | --- |
| Regression | Exact-revision automated checks of authority, service effects, queue integrity and UI | The tested implementation behaves as recorded |
| Controlled technical comparison | Four B,C,C,B blocks, 20 synthetic citizen fixtures, 120 requests | Both authority routes completed the fixed workload with zero tested unauthorised or duplicate effects |
| Ledger replay | Archived E2 trace audit with 100 scripted attempts, 120 recorded requests, 40 unique operations, 20 replays and 40 refusals | Audited execution traces can be retained and inspected |
| Exploratory real-agent observations | Existing About route-choice records, with their original tools and dates | What happened in those specific runs |
| Vendor identification | Actual acceptance still outstanding in issue #68 | No live-vendor success claim yet |
| Genuine participant research | No completed human/AI participant corpus | No adoption, detection-accuracy or citizen-effort estimate |

The ledger's 100 scripted attempts are a replay of archived technical traces, not 100 newly observed agents or participants. The 120 requests are the original four comparison blocks. Never sum regression checks, replayed records and live observations into a population sample.

The [E2 record](../evidence/RUN-20261009-E2-01.md) preserves raw traces and independent business-state checks. [Combined engineering validation](https://github.com/sighmoan1/govuk-delegate-starter/issues/90#issuecomment-6090819665) records a later isolated runtime and manual journey. These have different source revisions. The E2 comparison found no incremental outcome advantage for Delegate in its fixed task set. Its timing comparison is confounded, and human effort/cost were unmeasured.

## The adoption and observation-burden hypothesis

A useful authorised route could attract most well-behaved agents, making identity and permission directly inspectable. The expected benefit is less inference work and more effort helping citizens/providers use the route. Adoption, residual unexplained activity and investigation effort need measurement together. Include legitimate tool incompatibility, accessibility barriers and malfunction or misuse by authorised agents. Low adoption or unchanged/higher investigative burden would weaken the proposition.

Combining browser, HTTP, behaviour and identity evidence could improve understanding. Correlated clues, spoofing, device variation and missing coverage may limit improvement. A fingerprint match establishes device/session evidence rather than AI authorship or intent. The current signature stub reports its narrow input, not learned AI detection. Future evaluation must compare individual signals with combinations on held-out cases.

## Architecture discussion

The [decision backlog](../DECISION_BACKLOG.md) assigns owner roles and reopening triggers. DB-07 covers central/federated/hybrid authority, DB-08 verification, DB-09 catalogue governance, DB-11 retention and DB-12 grouped consent. DB-01/02 concern recognised authority and exact-action approval. Those national choices remain deferred. No slide proposes an approved architecture or legal conclusion.
