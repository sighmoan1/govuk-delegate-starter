# Sources and precedents

Checked 7 October 2026.

## HMRC Agent Authorisation API

https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/agent-authorisation-api/2.0

Why it matters:

- REST API;
- v2.0 beta;
- sandbox and production;
- can request authorisation;
- cancel requests;
- check request status;
- query active or inactive relationships.

## HMRC digital handshake

https://www.gov.uk/guidance/how-to-use-the-digital-handshake-to-get-authorised-as-a-tax-agent

https://www.gov.uk/guidance/authorise-an-agent-to-deal-with-certain-tax-services-for-you

Why it matters:

- agent initiates an authorisation request;
- client receives a link and authenticates independently;
- the request expires if not approved;
- once approved, the agent can transact for the client;
- clients can change or remove authorisation;
- agents must not use client sign-in credentials.

## GOV.UK One Login technical documentation

https://docs.sign-in.service.gov.uk/

https://docs.sign-in.service.gov.uk/how-gov-uk-one-login-works/

https://docs.sign-in.service.gov.uk/quick-start/

Why it matters:

- One Login is the common government sign-in / identity direction;
- it is OIDC-compliant;
- it supports a local simulator and integration environment;
- public documentation describes the authorisation-code flow and integration model.

## Delegated authority guidance

https://www.gov.uk/guidance/delegated-authority-guidance

Why it matters:

Government already describes evidence of authority as needing to identify:

- the subject;
- the representative;
- the permissions granted;
- when those permissions were granted;
- any relevant conditions, such as duration or value limits.

This is the conceptual basis for Delegate's relationship model.

## DWP / Universal Credit representation and explicit consent

https://www.gov.uk/guidance/get-help-with-your-universal-credit-claim

https://www.gov.uk/government/publications/working-with-representatives-guidance-for-dwp-staff/working-with-representatives-guidance-for-dwp-staff

Why it matters:

- Universal Credit recognises explicit consent for a representative;
- consent can be limited and withdrawn;
- DWP distinguishes authority to receive information from authority to transact;
- DWP already has a policy domain around representatives that a digital delegation product would need to respect.

## Office of the Public Guardian — Use an LPA

https://www.gov.uk/guidance/add-an-lpa-to-your-use-an-lpa-account

https://www.gov.uk/guidance/getting-started-with-use-an-lpa

Why it matters:

- the service now uses GOV.UK One Login;
- authority can be associated with the account;
- users can create time-limited access codes for organisations to verify the LPA;
- it demonstrates another government pattern for digitally proving authority.
