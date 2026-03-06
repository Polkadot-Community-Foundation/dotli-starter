# Triangle Starter Kit

Takes `src/index.html` + `src/main.js` (with external ESM dependencies) and builds a single self-contained `dist/index.html`.

## Prerequisites

- Node.js >= 18
- [DotNS CLI](https://github.com/paritytech/dotns-sdk) (for deployment only)

## Install

```
npm install
```

## Develop

```
npm run dev
```

Opens a local server at `http://localhost:8000` serving `src/` directly (uses import maps for dependencies).

## Build

```
npm run build
```

Bundles all JS dependencies into a single `dist/index.html` via esbuild.

## Deploy

Requires the DotNS CLI installed and linked:

```
cd dotns-sdk-main/packages/cli
bun install && bun run build && npm link
```

IMPORTANT (before proceeding): 
- A small manual step is required, fund your account (SS58) with https://faucet.polkadot.io/
- Authorize your account to write to bulletin: https://paritytech.github.io/polkadot-bulletin-chain/

Set your mnemonic and deploy:

```
export DOTNS_MNEMONIC="your twelve word mnemonic phrase goes here ..."
./deploy.sh <name>
```

Your site will be live at `https://<name>.dot.li`.
