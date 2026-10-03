# ShieldLabs Google Tag Manager integration

Install the ShieldLabs browser agent through Google Tag Manager. The tag loads the agent, runs an identification when its trigger fires, and publishes the request ID to the data layer.

## Import the template

1. Download `template.tpl` from a released version. Keep its `.tpl` extension.
2. Open your website's GTM web container, then **Templates → Tag templates → New**.
3. Open the editor's **⋮ → Import**, select `template.tpl`, and save.
4. Create a tag and select **ShieldLabs** as its tag type.
5. Enter the registered domain's Public Key, choose the environment and a trigger, then use GTM Preview to test before publishing.

The site must already have GTM installed. Use a registered development domain for tests. A request ID can be issued before the server accepts and scores the identification; verify ingestion in your analytics dashboard or through the History API.

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

Allow the adapter host and the selected ShieldLabs CDN in your site's Content Security Policy, plus the ShieldLabs connection endpoints used by the agent. Content blockers can block GTM and prevent the tag from running.

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

## License and support

Apache-2.0. The bundled browser SDK is MIT-licensed; see `THIRD_PARTY_NOTICES.md`. Report issues in this repository or email contact@shieldlabs.ai.
