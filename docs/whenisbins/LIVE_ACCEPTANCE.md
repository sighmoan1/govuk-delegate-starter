# What the real WhenIsBins test has established

Verified on 10 October 2026. Public entry: [Delegate and real bin collections](https://whenisbins-demo.bathos.org). The [redacted public evidence record](https://whenisbins-demo.bathos.org/evidence) is readable without repository access. Presenter controls require a private access code. No address, inbox, credential or secret email link appears in this record.

## What is real

The bin-date requests and reminder signup used the existing public WhenIsBins service. The verification email was received in the designated Gmail inbox, and the native website confirmed activation. Tom made no integration change; we did not change his repository or contact him.

Delegate, GOV.UK sign-in, Sam's identity and the test phone remain a prototype using synthetic government data. Our connector checks that prototype authority before contacting WhenIsBins. WhenIsBins does not itself recognise Delegate, and its existing website/API can be used without our connector.

## Results

| Journey | Observed result | Evidence boundary |
| --- | --- | --- |
| Read bin dates | Public HTTPS request, citizen consent, scoped authority and real lookup completed. Removing permission caused a later request to be refused before contacting the provider. | A real returned calendar is not a guarantee that the council's underlying data is fresh or complete. |
| Request reminder emails | Separate consent and exact address/inbox approval preceded one native signup submission. A verification email arrived at 09:14:32 UTC. A freshly checked continuation submitted the native confirmation form; the website showed “Your reminders are on” at 09:28:44 UTC. The original operation was reconciled without resubmitting signup or activation. | Verification-mail delivery and activation are separately established. Delivery of a future collection reminder is not yet established. |
| Run a scheduled check | A citizen-approved weekly task was saved, the connector was restarted, and the ordinary-clock worker completed a real lookup at 10:33:12.699 Europe/London. A separate due task was refused at 10:36:12.717 after its grant was revoked. Both test tasks were stopped. | This tests one real due execution and one refusal. It does not establish indefinite service availability or a distributed scheduler. |
| Observe these journeys | The deployed connector's protected feed supplied 20 minimised source events. Observatory ingested them into an isolated PostgreSQL database; repeated import inserted zero, and a new SQL connection retained the records. Protected monitoring and authentication/redaction checks passed. | These are observations of our connector, not Tom's other visitors. Source identifiers are not independently verified effects or measures of AI accuracy. |
| Cancel reminders | Parked and unverified under [#132](https://github.com/sighmoan1/govuk-delegate-starter/issues/132). No legitimate stop link was present in the verification email or activation page. WhenIsBins supplies it in a subsequent reminder email. | Cancellation controls are unavailable until the actual stop form and outcome have been verified. The test reminder subscription is currently active. |

The returned source calendar reported retrieval on **14 September 2026 at 00:59:49 UTC**, with `published_calendar` confidence and a `limited_horizon`. An unchanged response does not establish a new council-data retrieval. The live result preserves these qualifications.

## What Observatory saw

The final live-only scan at 09:39:33 UTC contained 5 admitted, 2 completed lookup, 3 refusal, 5 pending subscription, 1 confirmed subscription, 2 schedule registration and 2 scheduled occurrence events. Earlier fixture rows are excluded. Fifteen distinct recorded request identifiers, four task identifiers, two occurrence identifiers, five outbound-call identifiers and three effect identifiers describe the source records; they are not counts of independent business effects or upstream network requests.

The completed scheduled lookup correlates with its registration, occurrence and admitted/completed request, check and outbound identifiers. The refused scheduled lookup correlates with its registration and occurrence and has no outbound/effect identifier. The redacted refusal record omits its reason: independent controlled journey evidence establishes the preceding revocation. Observatory must not infer that cause from the event alone.

The protected monitoring attempt used for this acceptance remains `UNLABELLED`, and its exact WhenIsBins event binding is `REQUEST_ONLY`. WhenIsBins bindings reject promotion to `UNIQUE_OPERATION`. No browser fingerprint, independent upstream effect, council-cost saving or classifier accuracy is asserted. The full monitoring interface remains private. [Detailed live-source checkpoint](https://github.com/sighmoan1/govuk-delegate-starter/issues/119#issuecomment-6096212186).

## Controls and verification

The automated suites separately cover authorised, undelegated, revoked, expired, unknown-delegate, missing-relationship and wrong-property attempts, with activity records for every attempt. Refused attempts make no provider call. Browser acceptance covers unchecked consent, exact-action approval and synthetic cancellation as a regression test; synthetic cancellation does not establish real cancellation.

Private native receipts persist before uncertain writes, so a retry cannot blindly submit another signup. Mail evidence is bound to the original exact operation and resources. A delivered verification request stays pending until independently observed native activation. Scheduled checks use fresh agent tokens and the original grant on every occurrence; finite agreements, durable occurrence keys and pause/resume/stop belong to the agent runner.

Final hosted checks are linked from [PR127](https://github.com/sighmoan1/govuk-delegate-starter/pull/127). On 10 October 2026 the owner approved shipping the verified lookup, recurring-agent, monitoring and native signup/activation delivery separately from parked real cancellation [#132](https://github.com/sighmoan1/govuk-delegate-starter/issues/132). Cancellation stays disabled and the test subscription remains active; no ongoing mailbox polling or repeat signup is scheduled. [Issue119](https://github.com/sighmoan1/govuk-delegate-starter/issues/119) records the actual test checkpoints; component issues115–118 track their focused changes. Tom-dependent issues120–122 remain explicitly on hold.

The public address uses the existing named tunnel and the presenter's Mac. Docker and the Mac must remain available. This is a publicly accessible prototype with verified bounded journeys; always-on hosting is a separate next step. The original four public applications, stored grants/activity and existing credentials were retained without reset.
