# ShieldLabs Google Tag Manager integration

[![CI](https://github.com/ShieldLabs-ai/shieldlabs-gtm/actions/workflows/ci.yml/badge.svg)](https://github.com/ShieldLabs-ai/shieldlabs-gtm/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/ShieldLabs-ai/shieldlabs-gtm)](https://github.com/ShieldLabs-ai/shieldlabs-gtm/releases/latest)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)

Install the [ShieldLabs](https://shieldlabs.ai) browser agent through Google Tag Manager. Choose when to load the agent and identify a visitor, then use its request ID in downstream GTM tags. Retrieve Risk Score, Visitor ID and Device ID from your backend through the History API or webhooks.

**[Download the template](https://github.com/ShieldLabs-ai/shieldlabs-gtm/releases/latest/download/template.tpl)** · **[Releases](https://github.com/ShieldLabs-ai/shieldlabs-gtm/releases)** · **[Verification](docs/verification.md)** · **[Report an issue](https://github.com/ShieldLabs-ai/shieldlabs-gtm/issues)**

### Contents

- [Quick start](#import-the-template)
- [Tag modes](#tag-modes)
- [Fields](#fields)
- [Events and downstream variables](#events-and-downstream-variables)
- [Consent](#consent)
- [Permissions and hosting](#permissions-and-hosting)
- [Troubleshooting and limitations](#troubleshooting-and-limitations)
- [Development](#development)

## Import the template

1. Create a [ShieldLabs account](https://shieldlabs.ai) and register your website domain. Get its Public Key from the console.
2. Download [template.tpl](https://github.com/ShieldLabs-ai/shieldlabs-gtm/releases/latest/download/template.tpl) from the latest release. Keep its `.tpl` extension.
3. Open your website's GTM web container, then **Templates → Tag templates → New**.
4. Open the editor's **⋮ → Import**, select `template.tpl`, review the permissions, and save.
5. Create a tag and select **ShieldLabs** as its tag type. Choose **Load and identify**, enter the Public Key and select the account's environment.
6. Choose a trigger and configure consent requirements. Use **GTM Preview** to check the `ShieldLabs.identified` event and its request ID.
7. Confirm that the same request ID appears in History, then publish your GTM container when ready.

The site must already have GTM installed. Use a registered development domain for tests. A request ID can be issued before the server accepts and scores the identification; verify ingestion in your analytics dashboard or through the History API.

Installation currently uses manual template import. This integration is not listed in the Google Community Template Gallery. Importing a template does not publish your website's container or add a ShieldLabs subscription.

## Tag modes

| Mode | Behavior |
| --- | --- |
| Load and identify | Load the adapter and browser agent, then create one identification. |
| Load | Load the adapter and agent without creating an identification. |
| Identify | Create one identification using the previously loaded agent. |

For separate Load and Identify tags, use the same Public Key and environment. Trigger Identify after the Load tag completes, using GTM tag sequencing or the `ShieldLabs.loaded` event. Running Identify before Load fails with `not_loaded`.

Repeated Load calls share one agent import. Each Identify call creates a fresh request ID. Choose triggers deliberately to avoid extra identifications from repeated page or SPA events.

## Fields

| Field | Use |
| --- | --- |
| Public Key | Public Key of the registered domain. Server keys must stay on your backend. |
| Environment | Production or Development. Development uses `dev.cdn.shieldlabs.ai`. |
| User HID | Optional hashed or pseudonymous account identifier computed on your server. Leave empty for anonymous checks. GTM variables are supported. |
| Result variable name | Defaults to `ShieldLabsResult`. Use a simple top-level name; `event`, `ShieldLabsError`, prototype names and dotted paths are rejected. |
| Timeout | Milliseconds for each load or identification step, default 10000, maximum 60000. |

## Events and downstream variables

- `ShieldLabs.loaded`: the browser agent is ready.
- `ShieldLabs.identified`: contains the request ID and identification callback latency.
- `ShieldLabs.error`: contains an error code in `ShieldLabsError.code`.

```js
{
  event: 'ShieldLabs.identified',
  ShieldLabsResult: {
    requestId: 'a-request-uuid',
    timeToIdentifyMs: 120
  }
}
```

Create a **Data Layer Variable** named, for example, `ShieldLabs request ID`, with the data layer name `ShieldLabsResult.requestId` and version 2. Use a **Custom Event** trigger for `ShieldLabs.identified` on tags that need that variable.

GTM's processed data model is authoritative. The page's raw `window.dataLayer` array is not a complete event log for calls made through sandbox template APIs. To read a result from page JavaScript after identification, use the supported model accessor:

```js
window.dataLayer.push(function () {
  const result = this.get('ShieldLabsResult');
  if (result) {
    console.log(result.requestId);
  }
});
```

This accessor reads the current value; it does not wait for a new identification. Use the `ShieldLabs.identified` trigger to coordinate downstream work and avoid reusing a result from a previous action.

The browser result contains a request ID. Your server retrieves Risk Score and other intelligence through the History API or a signed webhook. Keep the page open while identification data is being sent; the callback occurs before every follow-up request has finished. A GTM trigger does not wait for the server verdict or stop a form submission automatically.

## Consent

Configure **Advanced settings → Consent settings → Require additional consent** on the tag according to your site's consent policy and CMP. Set consent defaults before the GTM container loads. If consent is denied, GTM does not execute the tag. After a consent update, fire its chosen event again. Avoid the "always fire" override when a consent requirement should apply.

Apply the requirement to every ShieldLabs tag that can start the agent or identification. Consent settings control GTM tag execution; they do not unload an agent that already started. The hosted agent can perform automatic activity checks outside GTM. On withdrawal, suppress future tags and reload the page with the updated consent default before the agent loads again. The current browser SDK has no stop or teardown method.

## Permissions and hosting

The template allows injection of its exact versioned adapter URL, execution of `ShieldLabsGTM.loadAgent` and `ShieldLabsGTM.identify`, reading of `ShieldLabsGTM.version`, and reading/writing the `dataLayer` queue. It does not read cookies, DOM fields, or account credentials. The loaded browser SDK collects signals outside the GTM sandbox.

Version 1.0.0 loads its adapter from:

```text
https://shieldlabs-ai.github.io/shieldlabs-gtm/gtm/v1.0.0/adapter.js
```

The adapter bundles `@shieldlabs-ai/js` 1.0.1 and loads the hosted agent from the selected ShieldLabs CDN. The GitHub Pages host serves the adapter; identification requests go to ShieldLabs services. Published adapter paths are kept by version. Update the template explicitly to move to another adapter version.

Allow the adapter host and the selected ShieldLabs CDN in your site's Content Security Policy, plus the ShieldLabs connection endpoints used by the agent. Content blockers can block GTM and prevent the tag from running.

## Troubleshooting and limitations

| Symptom | Check |
| --- | --- |
| `not_loaded` | Run Load first with the same Public Key and environment, or use Load and identify. |
| `load_failed` | Check the adapter/CDN requests, CSP and content blockers. Retry after restoring access. |
| `permission_denied` | Review the template's exact script and global permissions. |
| `invalid_options` | Check the key, environment, timeout, result name and User HID. |
| `timeout` | Inspect the network; keep the page open for collection and follow-up requests. |
| No event after a trigger | Check GTM Preview, trigger conditions and consent requirements. |
| ID returned but History is empty | Match the key's environment, allow collection to finish, and check server ingestion. A browser callback is not a server verdict. |

- Browser output contains a request ID and callback timing. It does not expose the server's Risk Score.
- Publishing a GTM tag does not automatically block a login, order or form submission. Coordinate the protected action and server lookup in your application.
- The current template supports User HID, but not arbitrary event metadata, custom snippet URLs, full proxy endpoints or regional routing.
- Consent withdrawal needs the handling described [above](#consent); an initialized hosted agent is not stopped by a GTM consent update alone.

## Development

```sh
npm ci
npm run check
```

`dist/adapter.js` bundles `@shieldlabs-ai/js` at its pinned version. `scripts/template.mjs` generates `template.tpl`. To build a template using another owned HTTPS adapter host:

```sh
SHIELDLABS_GTM_ADAPTER_URL=https://example.com/gtm/v1.0.0/adapter.js node scripts/template.mjs
```

Run the template's included tests inside GTM as well as Node tests. Node tests do not validate the real GTM permission editor, import format, or browser delivery. Maintain a versioned adapter URL and publish updated template metadata with each release.

The development fixture is at `https://dev.landing.shieldlabs.ai/gtm-test`. Open **GTM Preview** for the test container and connect that URL before using its buttons; the fixture's test tags are saved in an unpublished workspace. The page's event log shows its own trigger events, and Tag Assistant shows the template's processed events and tag outcomes.

The fixture's development label refers to the landing deployment. Choose the agent environment for the key's account: the existing ShieldLabs checker uses Production services even when its frontend runs on the development landing. The final live run used that checker configuration: 12 scenarios passed and all six GTM request IDs were retrieved from History, including an exact User HID match. See the accompanying verification report.

See [CONTRIBUTING.md](CONTRIBUTING.md) for release and hosting steps. CI builds and checks the generated template on Node 20, 22 and 24. Runtime verification uses a real GTM web container in addition to the automated tests.

## License and support

Apache-2.0. The bundled browser SDK is MIT-licensed; see `THIRD_PARTY_NOTICES.md`. Report issues in this repository or email contact@shieldlabs.ai.
