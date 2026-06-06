
> [!WARNING]
> The following is a prototype, reference implementation, and proof-of-concept. This open source code is provided for research, experimentation, and developer education only. This code has not been audited, is actively experimental, and may contain bugs, vulnerabilities, or incomplete features. Use at your own risk.



# dotli Starter Template

![dotli](/docs/dotlistarter.png)

Simple dotli starter built with plain HTML, CSS, and JavaScript. It uses npm-installed packages and a Vite-style workflow, without React. It's meant as a 0-to-1 template to get started quickly. For a much more thorough set of examples, including AI helpers, please check out https://github.com/paritytech/polkadot-apps

It demonstrates the new `@parity/product-sdk-host` flow against **Paseo Next v2 Asset Hub**:
- Detect the host container (`isInsideContainer`)
- Resolve a **product account** for the page's DotNS identifier (`getAccountsProvider`)
- Sign a raw message (`getTruApi().signRaw`)
- Submit a `System.remark` extrinsic via the host's chain provider (`getHostProvider` + `polkadot-api`)
- Read finalized chain state
- Persist a draft to app-scoped storage (`getHostLocalStorage`)

The product-account flow binds signing to the DotNS identifier of the URL the host loaded. When running locally via `npm run preview`, that identifier is `localhost:4173`; when deployed via `bulletin-deploy`, it's your `<name>.dot`.

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

## Deploy

This starter uses [`bulletin-deploy`](https://github.com/paritytech/bulletin-deploy). The older local DotNS CLI deploy flow has been removed.

### Local deploy

Install `bulletin-deploy` and its IPFS prerequisite:

```bash
npm install -g bulletin-deploy

# macOS
brew install ipfs
ipfs init
```

Build and deploy:

```bash
npm run build
bulletin-deploy login # follow the instructions
bulletin-deploy ./dist my-app00.dot
```

Your site will be live at :
- Polkadot Desktop: `my-app00.dot`
- Polkadot Web: `https://my-app00.dot.li`


