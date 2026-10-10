# Demo and stakeholder claims guide

> **Purpose:** A repeatable demonstration of *how Delegate could improve government's response to agent-enabled demand*, without overstating what the current prototype proves. For experiments, see [VALIDATION.md](VALIDATION.md). For actual logged evidence, see [EVIDENCE.md](EVIDENCE.md).
>
> **Status:** Demo script, **not** an experimentally verified business case.

## Start here

Visitors: open the [public briefing](https://about-demo.bathos.org/briefing), then its [demonstration guide](https://about-demo.bathos.org/briefing/demo). This is the current guide for the short demo; the [presenter runbook](briefings/DEMO_RUNBOOK.md) supplies preparation, client commands and optional scenes. The seven-minute stakeholder discussion below extends that same journey.

Operators: open [the private dashboard](http://localhost:3304) on the presenter computer for scenario controls and [agent prompts](http://localhost:3304/ask-your-agent). Reset controls change the shared synthetic state: rehearse on an isolated stack and coordinate before resetting. Public pages expose explanations, not reset controls or Sam's phone details.

### Public visitor routes

| URL | Purpose |
|---|---|
| [Briefing](https://about-demo.bathos.org/briefing) | Project explanation, concept/design briefings and editable decks |
| [Demo guide](https://about-demo.bathos.org/briefing/demo) | Short consent → action → revocation walkthrough and optional scenes |
| [Delegate account](https://delegate-demo.bathos.org/account/delegates) | Approve requests, inspect permissions/outcomes and remove access |
| [Mock HMRC](https://hmrc-demo.bathos.org) / [agent entry](https://hmrc-demo.bathos.org/act-for-someone) | Synthetic tax service and browser-agent request route |
| [One Login simulator](https://login-demo.bathos.org) | Synthetic sign-in, normally reached from HMRC or Delegate |
| [WhenIsBins demo](https://whenisbins-demo.bathos.org) / [evidence](https://whenisbins-demo.bathos.org/evidence) | Separate bin-service connector and its qualified evidence; presenter controls require access |

These named tunnel addresses depend on the presenter Mac, Docker and tunnel process staying available. A URL is not an uptime promise. HMRC/identity data is synthetic. The WhenIsBins connector can contact an external provider; follow its [limits](whenisbins/CONNECTOR.md) before provider actions. Real cancellation remains disabled/unverified in #132; removing Delegate authority does not unsubscribe an existing reminder.

### Private operator and research routes

| URL | Purpose and availability |
|---|---|
| [Local dashboard](http://localhost:3304) | Presenter controls, scenarios and prompts; private to the presenter computer |
| [Sam's phone](http://localhost:3304/sams-phone) | Private mock sign-in/code tooling; keep off public tunnels and screen sharing |
| [Local swarm](http://localhost:3304/swarm) | Synthetic load demonstration with service outcomes and labelled simulations |
| `http://localhost:3303` | Standard Observatory port when configured/running; protected research workbench |
| `http://localhost:5303` | Temporary protected Observatory review instance, not a permanent visitor destination |
| `http://localhost:5703/whenisbins` | Temporary protected connector research instance, not a permanent visitor destination |
| `http://localhost:3305` | Independent synthetic council, available when the council app is started |

Research instances need their configured access keys and feed setup. Obtain the actual instance address from the operator; do not assume a recorded port is running. Runtime inventory and retirement belong in [LOCAL_RUNTIME.md](LOCAL_RUNTIME.md). Never put keys in this guide.

## The three-minute core demonstration

1. A compatible browser agent starts at HMRC's agent entry, or the presenter uses the runbook's scripted API client. Create a fresh request and open its returned consent URL.
2. Sign in as Sam using the private synthetic sign-in setup. Select tax-code access and job-expenses claims; leave employment changes unchecked. Review and allow. The agent checks request status after approval.
3. Through the same agent identity, read the tax code and submit a synthetic claim. HMRC checks current Delegate authority and its own domain rules. Show the receipt/outcome; distinguish received work from later recorded work.
4. Try the ungranted employment action. Show the authority refusal rather than a malformed-request validation error.
5. In Delegate, inspect the scope, original approval and service activity. Remove access and confirm.
6. Retry the tax-code action through the same agent. Show the revoked-authority refusal and its activity event.

The account manages permission; the agent/client sends service actions. The [runbook](briefings/DEMO_RUNBOOK.md#a-citizen-permission-and-service-enforcement-about-three-minutes) gives exact preparation and client commands. Existing accepted work can finish after revocation. A prior claim can trigger HMRC's one-claim-per-tax-year rule; prepare a fresh isolated synthetic principal for rehearsal instead of resetting shared state.

## The opening story (about 60 seconds)

**Problem:** Agents can drastically increase requests to government services. Some are worthwhile, lawful citizen work; some are retries and inefficient polling; others lack authority or contain invalid submissions. Treating all automated requests as one “flood” risks keeping out people who deserve service.

**Proposition:** Make genuine delegation explicit and easy. The person authorises a representative for named actions; the service checks the mandate, enforces its own rules and returns a usable outcome. A strong API handles technical volume; Delegate provides a common citizen-control and trust layer.

**Evidence question:** Compared with an equally capable API and service-local representative authorisation, does Delegate improve consent, revocation, attribution and citizen outcomes enough to justify its additional effort and cost?

A new *legitimate* claim should not be treated as abuse merely because an agent submitted it.

## A seven-minute walkthrough

| Time | Demonstration | What you can say | What you must not infer |
|---|---|---|---|
| 0:00–1:00 | [About overview](../apps/about/src/app/page.tsx) | Separate real citizen demand, duplicates and unauthorised actions | “Every additional automated claim is a flood” |
| 1:00–2:30 | Consent and “Who can act for you” synthetic journey | A person can grant and later revoke a bounded mandate in the prototype | Consent is already proven accessible or legally sufficient everywhere |
| 2:30–3:30 | Mock HMRC transaction through the delegated path | A service can check a mandate and apply its own business rules | Delegate itself adjudicates tax relief |
| 3:30–4:45 | [Swarm scenario](../apps/about/src/app/swarm/page.tsx) | Distinguish one person's repeated attempts from distinct citizens; service-side limits operate on principal identity | Those limits improve national throughput; all distinct legitimate applications have been preserved under load |
| 4:45–5:30 | [Agent route observations](../apps/about/src/app/which-route/page.tsx) | We have exploratory observations that real agent tools can fail to find or complete handoff routes | Agents overwhelmingly prefer Delegate; a population adoption percentage |
| 5:30–6:15 | [Validation programme](VALIDATION.md) — E2 comparator | A better API might explain the efficiency gains; we are testing what Delegate specifically adds | API+Delegate is already known to be cheaper than API-only |
| 6:15–7:00 | [Evidence register](EVIDENCE.md) | What is implemented, what is exploratory, what remains to be tested | Equating a video demo or test source with a controlled outcome study |

The prototype's existing scenarios are *demonstrations of software behaviour and exploratory observations*. They are not already-run RCTs, a UK government pilot, or evidence of saved taxpayer money.

## Two contrasting pictures to show

**Current patterns (simplified):** an agent encounters an ordinary website; it may rely on a shared person session, get stuck on identity challenges, poll excessively, or ask for credentials. The service often cannot distinguish a representative from the account holder.

**Target pattern:** the agent is identified, the person approves an appropriately scoped grant using an independent consent interface, the agent uses a documented API, and the receiving service enforces both authority and domain rules. The citizen can inspect/revoke the grant. Efficient processing, idempotency and polling control are service-side responsibilities.

Avoid saying that all unidentified browsers are malicious or that detecting AI reliably solves anything.

## Claims ladder: permitted language

| Evidence available | Appropriate statement | Unwarranted statement |
|---|---|---|
| Software design / source | “The prototype implements a checkable, revocable delegated-authority pattern.” | “The UK has a production-ready national delegation service.” |
| Automated test with pinned passing run | “Under the recorded synthetic workload, repeated submissions had one business side effect.” | “Delegate eliminated real-world fraudulent/duplicate claims.” |
| Individual exploratory agent runs | “In these particular runs some agents struggled with discovery and consent handoff.” | “Most agents bypass proper authorisation.” |
| Controlled E2 experiment | “In this tested environment, adding Delegate changed [named outcomes] compared with service-local delegated API access.” | “All improvement comes from Delegate.” |
| Governed service field evidence | “In this setting, with these users, baseline and controls, we measured [effect and uncertainty].” | “The effect generalises across all of government.” |

Never give an unmeasured numerical “saving” or an accuracy percentage without denominator, evidence link, method and study date.

## Three audience lenses

- **Permanent secretary / policy:** Are genuine claimants still served? What stops unauthorised action? Can we distinguish demand from abuse? What are the citizen-rights and accountability trade-offs?
- **Service owner / operations:** How much extra integration and consent effort? Does an API-only solution already handle most volume? Can we receive work durably and distinguish queueing from refusal?
- **Architecture / security:** Where are identity, authority, service decision and transaction integrity enforced? How do revocation, subdelegation, scope narrowing, cross-service identity and outages work?

## Where to leave someone after the demo

Share the [public briefing](https://about-demo.bathos.org/briefing) and the exact run links in [EVIDENCE.md](EVIDENCE.md). The fuller “Evidence and experiments” page is available on the private About dashboard at `/evidence`; it is outside the public briefing allowlist. When new evidence changes the proposition, update the evidence register and demonstration claims, not the past run.

**Open questions are allowed.** Delegate/Orchestrate boundaries, federated authority and technical decision mechanisms are separate architecture decisions. The evidence programme should survive whichever architecture is chosen.
