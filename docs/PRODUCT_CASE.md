# Product case

## The problem

Government services are likely to receive more transactions that are created, prepared or submitted by software agents.

Trying to solve this primarily by detecting whether text was written by AI is weak for three reasons:

1. detection is uncertain;
2. legitimate and illegitimate uses can look alike;
3. even perfect detection would tell us very little about **who authorised the action and what the agent was allowed to do**.

The more useful question is therefore not:

> Did AI write this?

It is:

> Who is acting, for whom, with what authority, and at what scale?

## Hypothesis

**The best way to reduce harmful agentic flooding is to make legitimate automation easier to identify and use than undeclared automation.**

If government provides a trusted route for authorised agents, legitimate agent providers have a reason to identify themselves rather than pretending to be humans or scraping human-facing services.

That trusted route can give legitimate actors useful advantages: stable machine interfaces, structured responses, sensible throughput, clearer errors and predictable authentication.

Government can then focus stronger controls on activity that remains unidentified or unauthorised.

This does not eliminate hostile automation. It **shrinks the ambiguous middle**.

## Product proposition

### GOV.UK Delegate

A common service that lets a person authenticated through GOV.UK One Login give another actor scoped, revocable authority to act on their behalf.

It should allow a person to answer:

- Who can act for me?
- Which government services can they deal with?
- What exactly can they do?
- When does that authority expire?
- What have they done?
- How do I remove their access?

It should allow a government service to answer:

- Who is the principal?
- Who is the delegate?
- Is the relationship still active?
- Does it cover this service?
- Does it cover this particular action?
- Are there conditions or limits?

## Trusted and untrusted lanes

The product creates a useful distinction between **known authority** and everything else.

### Trusted lane

An authenticated human, or a delegate whose identity and authority can be checked.

Possible treatment:

- stable APIs or agent interfaces;
- higher or more predictable rate limits where appropriate;
- structured machine-readable errors;
- fewer unnecessary bot challenges;
- clear audit trail;
- risk-based step-up approval for sensitive actions.

### Untrusted lane

Traffic whose identity or authority has not been established.

Possible treatment:

- lower rate limits;
- additional abuse controls;
- step-up authentication;
- greater scrutiny;
- limits on machine-scale interaction.

This must not become a route for excluding people who have difficulty proving identity or using digital services. The service should actively identify the barriers that prevent legitimate actors entering the trusted lane and provide assisted routes where needed.

## Why this helps with agentic flooding

Without delegation infrastructure, government sees a mixed stream of humans, assistive tools, legitimate software agents and hostile automation. It has to infer what is happening from behaviour and content.

With a trusted delegation route, a substantial category of legitimate automated activity becomes directly observable.

Government can know:

- which registered delegates are active;
- how many principals they represent;
- which services they transact with;
- which capabilities they use;
- transaction rates;
- denial rates;
- unusual fan-out or retry patterns;
- when an authority was revoked or expired.

The remaining problem — automation that deliberately stays outside the trusted route — still needs conventional abuse controls and research. Canary experiments or behavioural indicators could be used as population-level signals, but they should not be treated as reliable proof that an individual claim was AI-generated.

## What we are drawing from

### HMRC agent authorisation

HMRC already has the strongest direct precedent. Registered agents can request authorisation, the client independently approves it, HMRC records the relationship, software can query its state and authorisation can be removed.

**We should copy this lifecycle before inventing anything new.**

### GOV.UK One Login

One Login already provides the cross-government direction for authenticating users and proving identity. Delegate adds a different relationship: not "who are you?" but "who may act for you?".

### DSIT delegated-authority guidance

Government guidance already describes evidence of delegated authority in terms of the subject, representative, permissions, timing and conditions. This gives us a government-native conceptual model rather than an AI-specific one.

### DWP representatives and Universal Credit explicit consent

DWP already recognises that claimants may need another person or organisation to represent them, and Universal Credit supports explicit consent that can be limited and withdrawn. But existing public guidance is primarily about disclosure and assistance, not a reusable machine-verifiable transaction mandate.

### Use an LPA

The Office of the Public Guardian's service shows another useful pattern: authority is associated with a One Login account and can be proved to an organisation using a time-limited access mechanism.

## Built on existing capabilities

This prototype is intentionally evolutionary.

It builds on:

- **OIDC / OAuth-style authentication** rather than creating a new identity protocol;
- **GOV.UK One Login** for principal authentication;
- **existing government agent-authorisation patterns** rather than inventing a new lifecycle;
- **government delegated-authority guidance** for what evidence of authority needs to contain;
- **service-defined permissions** so departments retain control of which actions exist and which are high risk;
- **normal API observability and rate limiting** for monitoring and traffic controls.

## What this does not solve

GOV.UK Delegate does not prove that every undeclared transaction is human.

It cannot reliably tell whether a human used ChatGPT to draft some text before submitting it themselves.

It does not remove the need for fraud, abuse, bot or anomaly controls.

It does not settle every question about legal liability for autonomous agent actions.

It does something narrower and more immediately useful: **it gives legitimate delegation a common, explicit, machine-checkable route.**

## The product principle

> Make legitimate automation easier than illegitimate automation.

Or, in operational terms:

> Establish identity and authority before trying to infer intent from content.
