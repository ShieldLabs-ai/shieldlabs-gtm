# Verification

## Automated and native tests

Version 1.0.0 has 37 automated behavior tests and five tests included in the GTM template. Both suites passed during the initial live verification. Automated cases cover validation, modes, repeated calls, load recovery, isolation by key/environment, permission failures and wall-clock timeout races.

## Live GTM verification

On 3 October 2026, the template was imported into a real GTM web container and tested through Preview on the ShieldLabs development landing. The final run used the existing checker's production-service configuration.

| Check | Result |
| --- | --- |
| Identify before loading | Expected `not_loaded` failure |
| Load only | Agent loaded without an identification request |
| Anonymous identification | Matching History row |
| User HID identification | Matching History row and exact supplied User HID |
| Consent denied | Protected GTM tag blocked |
| Consent granted | Identification and matching History row |
| Consent withdrawn | Protected GTM tag blocked |
| Warm combined mode | Matching History row |
| Repeated identification | Fresh ID and matching History row |
| Simulated adapter HTTP 503 | Expected `load_failed` failure |
| Recovery without reloading the page | Agent loaded successfully |
| Cold combined mode | Matching History row |

All six resulting request IDs were read by a downstream GTM tag using a real Data Layer Variable and retrieved through the History API. Each History row contained the corresponding request ID, Visitor ID and Device ID. Identification and follow-up requests captured on ShieldLabs services returned HTTP 200. Tag Assistant reported zero console errors.

![Real GTM Preview summary with six downstream executions](images/gtm-preview.png)

## Scope

These checks establish the integration's behavior in the tested browser, container and environment. They do not guarantee delivery through every content blocker or site CSP. The development test workspace remains unpublished; customers import the template and publish their own containers.

Native GTM consent blocks tag execution. It does not unload a hosted agent that has already started; see the consent instructions in the README.
