
> [!WARNING]
> The following is a prototype, reference implementation, and proof-of-concept. This open source code is provided for research, experimentation, and developer education only. This code has not been audited, is actively experimental, and may contain bugs, vulnerabilities, or incomplete features. Use at your own risk.



# dotli Starter Template

![dotli](/docs/dotlistarter.png)

Simple dotli starter built with plain HTML, CSS, and JavaScript. It uses npm-installed packages and a Vite-style workflow, without React. It's meant as a 0-to-1 template to get started quickly. For a much more thorough set of examples, including AI helpers, please check out https://github.com/paritytech/polkadot-apps

It demonstrates the `@parity/product-sdk-host` flow against the **Summit Asset Hub** as a default — adapt it to the network you wish to deploy on by swapping the `CHAIN` constant in `src/main.js`:
- Detect the host container (`isInsideContainer`)
- Resolve a **product account** for the page's DotNS identifier (`getAccountsProvider`)
- Sign a raw message (`getTruApi().signRaw`)
- Submit a `System.remark` extrinsic via the host's chain provider (`getHostProvider` + `polkadot-api`)
- Read finalized chain state
- Persist a draft to app-scoped storage (`getHostLocalStorage`)

The product-account flow binds signing to the DotNS identifier of the URL the host loaded. When running locally via `npm run preview`, that identifier is `localhost:4173`; when deployed via `polkadot-app-deploy`, it's your `<name>.dot`.

## Prerequisites

- Node.js >= 18

## Install

```bash
npm install
```

## Build

```bash
npm run build
```

Builds the production app into `dist/`.

## Preview

```bash
npm run preview
```

Serves the built app locally from `dist/`. You can then open it either:
- in the Polkadot Desktop under `localhost:4173` 
- in Polkadot Web under `https://dot.li/localhost:4173`.

Note:
- For host testing, prefer `build` + `preview` or a deployed `dist/` bundle. Vite dev mode can run into host CSP restrictions.

## Deployment (Summit)

The app is published to the **Summit Bulletin chain** and bound to a `.dot` name with
[`@polkadot-community-foundation/polkadot-app-deploy`](https://www.npmjs.com/package/@polkadot-community-foundation/polkadot-app-deploy)
(the `polkadot-app-deploy` / `pad` CLI). The scoped package ships the `summit` env (RPCs + DotNS contract
addresses) built in, so `--env summit` is all the chain configuration you need.

### Prerequisites (one-time, per account)

- A `.dot` name **registered and owned** on Summit DotNS by your deploy account.
- That account must hold a **live Summit Bulletin storage authorization**. Authorizations are granted by the
  Summit authorizer and **expire (~13 days)**; if an upload fails with "not authorized for Bulletin storage",
  the authorization needs refreshing before anything else.

### Deploy from your machine

```bash
npm run build
npm install -g @polkadot-community-foundation/polkadot-app-deploy@0.11.0

# Passing --mnemonic selects DIRECT signer mode: the mnemonic account is BOTH
# the DotNS owner and the Bulletin upload signer. On Summit only that account
# is storage-authorized, so --mnemonic is required (do NOT use --suri, which
# leaves uploads on the unauthorized public pool and fails).
polkadot-app-deploy ./dist <name>.dot --env summit --mnemonic "$DOTNS_MNEMONIC"
```

Your site will then be live at:
- Polkadot Desktop: `<name>.dot`
- Polkadot Web: `https://<name>.dot.li`

### Deploy from CI

`.github/workflows/deploy-summit.yml` runs the same flow on GitHub Actions (manual via the **Actions** tab,
and automatically on pushes to `main` that touch app code). Configure it once:

- **Repository variable** `DOTNS_DOMAIN` — the `<name>.dot` to publish to.
- **Repository secret** `DOTNS_MNEMONIC` — the mnemonic of the account that owns `DOTNS_DOMAIN` and holds the
  live Bulletin authorization.


