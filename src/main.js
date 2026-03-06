// ---------------------------------------------------------------------------
// Polkadot Product SDK — Starter Kit
// ---------------------------------------------------------------------------
//
// This template demonstrates the core SDK features for building dApps that
// run inside the Polkadot Host (dot.li / Spektr / Polkadot Browser).
//
// Features covered:
//   1. Auto-initialization — injects the Spektr extension and fetches accounts
//   2. Login detection     — watches for account connect/disconnect via the Host
//   3. System.remark       — builds, signs, and submits a remark on-chain
//                            (uses signSubmitAndWatch for real finalization)
//   4. Sign raw            — signs an arbitrary message via the Host signer
//   5. Host storage        — read/write/clear JSON data persisted by the Host
//   6. Chain read          — query on-chain state via createPapiProvider
//                            (Host-managed chain connection, no direct WebSocket)
//
// The app auto-initializes on load. If no account is detected, it prompts the
// user to log in and automatically picks up the account when they do.
//
// To adapt this template:
//   - Edit CHAIN to point at your target chain
//   - Remove sections you don't need — each is self-contained
//   - The imports stay the same if you later move to a bundler
// ---------------------------------------------------------------------------

import {
  // injectSpektrExtension: injects the Spektr browser extension shim so the
  // Host can provide accounts and signing to this dApp.
  injectSpektrExtension,

  // createNonProductExtensionEnableFactory: creates a factory that, when
  // called, returns { accounts, signer } — the standard polkadot-js injected
  // interface. "Non-product" means it returns the user's root accounts (not
  // derived product accounts).
  createNonProductExtensionEnableFactory,

  // createAccountsProvider: gives access to the Host's account system at a
  // lower level. Needed for:
  //   - subscribeAccountConnectionStatus() — detect login/logout
  //   - getNonProductAccounts() — get accounts with raw publicKey bytes
  //   - getNonProductAccountSigner() — get a PolkadotSigner for polkadot-api
  //     (required for signSubmitAndWatch)
  createAccountsProvider,

  // metaProvider: subscribe to the transport-level connection status
  // (connecting / connected / disconnected).
  metaProvider,

  // sandboxTransport: the postMessage-based transport that connects this
  // iframe to the Host. Pass it to SDK factories so they communicate through
  // the Host bridge instead of a direct connection.
  sandboxTransport,

  // hostApi: low-level Host API for operations like signRaw.
  hostApi,

  // hostLocalStorage: Host-scoped key/value storage. Data is persisted by the
  // Host and scoped to this app's domain. Supports readJSON/writeJSON/clear
  // (also readBytes/writeBytes/readString/writeString).
  hostLocalStorage,

  // createPapiProvider: returns a JsonRpcProvider that routes chain RPC calls
  // through the Host's managed chain connection. Useful when you want the
  // Host to handle the WebSocket lifecycle. Pass a genesis hash to select
  // the chain.
  createPapiProvider,
} from "@novasamatech/product-sdk";

import { Binary, createClient } from "polkadot-api";
import { toHex } from "polkadot-api/utils";
import { getWsProvider } from "polkadot-api/ws-provider";

// ---------------------------------------------------------------------------
// Chain config
// ---------------------------------------------------------------------------
// Edit this to target a different chain. You need:
//   - genesis: the chain's genesis block hash (used for signing context)
//   - wsUrl:   a public WebSocket RPC endpoint (used for direct connections)
//
// The genesis hash is also used by createPapiProvider() to tell the Host
// which chain to connect to.
// ---------------------------------------------------------------------------
const CHAIN = {
  name: "Paseo Asset Hub",
  genesis: "0xd6eec26135305a8ad257a20d003357284c8aa03d0bdb2b357ab0a22371e11ef2",
  wsUrl: "wss://sys.ibp.network/asset-hub-paseo",
};

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const $greeting = document.getElementById("greeting");
const $statusText = document.getElementById("status-text");
const $log = document.getElementById("log");
const $btnRemark = document.getElementById("btn-remark");
const $remarkInput = document.getElementById("remark-input");
const $btnSignRaw = document.getElementById("btn-sign-raw");
const $rawInput = document.getElementById("raw-input");
const $btnStorWrite = document.getElementById("btn-stor-write");
const $btnStorRead = document.getElementById("btn-stor-read");
const $btnStorClear = document.getElementById("btn-stor-clear");
const $storageKey = document.getElementById("storage-key");
const $storageValue = document.getElementById("storage-value");
const $btnChainRead = document.getElementById("btn-chain-read");
const $btnClear = document.getElementById("btn-clear");

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let injected = null; // { accounts, signer } from the extension enable factory
let accounts = []; // fetched account list (address strings + names)
let providerAccounts = []; // accounts with raw publicKey bytes (from accountsProvider)
let accountsProvider = null; // SDK accountsProvider instance

// All interactive buttons — disabled until SDK is ready and user is logged in
const interactiveButtons = [
  $btnRemark,
  $btnSignRaw,
  $btnStorWrite,
  $btnStorRead,
  $btnStorClear,
  $btnChainRead,
];

// ---------------------------------------------------------------------------
// Logging helper
// ---------------------------------------------------------------------------
// Appends a timestamped, color-coded line to the #log element.
// Levels: "ok" (green), "err" (red), "info" (default, dark).
// ---------------------------------------------------------------------------
function log(msg, level = "info") {
  const ts = new Date().toLocaleTimeString();
  const cls = level === "ok" ? "ok" : level === "err" ? "err" : "info";
  $log.innerHTML += `<span class="ts">[${ts}]</span> <span class="${cls}">${msg}</span>\n`;
  $log.scrollTop = $log.scrollHeight;
}

$btnClear.addEventListener("click", () => {
  $log.innerHTML = "";
});

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

function showGreeting() {
  if (accounts.length === 0) {
    $greeting.innerHTML = "Please log in to the Host to continue.";
    return;
  }
  const a = accounts[0];
  $greeting.innerHTML =
    `Hello, <span class="name">${a.name || "Anonymous"}</span>` +
    `<span class="addr">${a.address}</span>`;
}

// Called whenever accounts change (login, logout, or initial fetch).
// Enables/disables all interactive buttons based on account availability.
function onAccountsChanged(accts) {
  showGreeting();
  const loggedIn = accts.length > 0;
  for (const btn of interactiveButtons) btn.disabled = !loggedIn;
  $statusText.textContent = loggedIn ? "Connected" : "Waiting for login...";
}

// ---------------------------------------------------------------------------
// 1. Auto-initialization
// ---------------------------------------------------------------------------
// The SDK is initialized automatically on page load. Steps:
//   a) Inject the Spektr extension shim
//   b) Create an enable factory (the bridge to the Host)
//   c) Fetch accounts
//   d) Subscribe to account connection status changes (login/logout)
//
// If no account is found, the UI shows a login prompt. When the user logs in,
// subscribeAccountConnectionStatus fires "connected" and we re-fetch.
// ---------------------------------------------------------------------------
async function init() {
  log("Initializing SDK...");
  $statusText.textContent = "Initializing...";

  try {
    // Step a: inject the extension shim into window.injectedWeb3
    await injectSpektrExtension();

    // Step b: create the enable factory. Returns null if not running in Host.
    const enableFactory =
      await createNonProductExtensionEnableFactory(sandboxTransport);
    if (!enableFactory) {
      log("Transport not ready — are you running inside the Host?", "err");
      $statusText.textContent = "Not in Host";
      $greeting.textContent = "Open this page inside the Host app.";
      return;
    }

    injected = await enableFactory();
    accountsProvider = createAccountsProvider(sandboxTransport);
    log("SDK ready", "ok");

    // fetchAccounts: re-creates the injected instance (picks up any new
    // session state) and fetches both address-based and publicKey-based
    // account lists. Called on init and after login.
    async function fetchAccounts() {
      injected = await enableFactory();
      accounts = await injected.accounts.get();

      // providerAccounts gives us raw publicKey bytes, needed for
      // getNonProductAccountSigner() and hostApi.signRaw().
      const res = await accountsProvider.getNonProductAccounts();
      providerAccounts = res.match(
        (a) => a,
        () => [],
      );

      log(
        `Found ${accounts.length} account(s)`,
        accounts.length ? "ok" : "info",
      );
      onAccountsChanged(accounts);
    }

    // Step c: initial account fetch
    await fetchAccounts();

    // Step d: watch for login/logout.
    // The Host fires "connected" when the user authenticates and
    // "disconnected" when they log out. On "connected", re-fetch accounts
    // to pick up the new session.
    accountsProvider.subscribeAccountConnectionStatus(async (status) => {
      const had = accounts.length;
      if (status === "connected") {
        log("Account connected", "info");
        await fetchAccounts();
        if (!had && accounts.length) log("Welcome!", "ok");
      } else {
        accounts = [];
        providerAccounts = [];
        onAccountsChanged(accounts);
        log("Account disconnected", "info");
      }
    });
  } catch (e) {
    log(`Init failed: ${e.message}`, "err");
    $statusText.textContent = "Error";
    $greeting.textContent = "Something went wrong. Try reloading.";
  }
}

// ---------------------------------------------------------------------------
// 2. System.remark — sign and submit on-chain
// ---------------------------------------------------------------------------
// Builds a System.remark extrinsic, signs it via the Host, submits it to the
// chain, and waits for finalization.
//
// Key concept: getNonProductAccountSigner() returns a PolkadotSigner that
// polkadot-api's signSubmitAndWatch() can use directly. This is the proper
// way to submit transactions — it handles nonce, mortality, and tip
// automatically, and gives you a stream of tx lifecycle events.
//
// The observable emits:
//   - { type: "txBestBlocksState", found: true } — included in a best block
//   - { type: "finalized", block: { hash, index } } — finalized on-chain
// ---------------------------------------------------------------------------
$btnRemark.addEventListener("click", async () => {
  if (!providerAccounts.length) return;

  $btnRemark.disabled = true;
  $btnRemark.textContent = "Submitting...";

  // Build a PolkadotSigner from the accountsProvider. This wires Host
  // signing under the hood — when polkadot-api calls signer.sign(), it
  // routes through the Host's signPayload handler.
  const signer = accountsProvider.getNonProductAccountSigner({
    dotNsIdentifier: "",
    derivationIndex: 0,
    publicKey: providerAccounts[0].publicKey,
  });

  const client = createClient(getWsProvider(CHAIN.wsUrl));

  try {
    log(`Connecting to ${CHAIN.name}...`);
    await client.getFinalizedBlock();
    log("Connected", "ok");

    const api = client.getUnsafeApi();
    const message = $remarkInput.value || "Hello from starter kit!";

    const tx = api.tx.System.remark({
      remark: Binary.fromBytes(new TextEncoder().encode(message)),
    });

    log("Signing & submitting...");

    // signSubmitAndWatch returns an Observable. Subscribe to it to track
    // the transaction through its lifecycle until finalization.
    await new Promise((resolve, reject) => {
      tx.signSubmitAndWatch(signer).subscribe({
        next(ev) {
          if (ev.type === "txBestBlocksState" && ev.found) {
            log("Included in best block, waiting for finalization...");
          } else if (ev.type === "finalized") {
            log(
              `Finalized in block ${ev.block.hash.slice(0, 18)}... (index ${ev.block.index})`,
              "ok",
            );
            resolve();
          }
        },
        error: reject,
      });
    });
  } catch (e) {
    log(`Remark failed: ${e.message}`, "err");
  } finally {
    client.destroy();
    $btnRemark.disabled = false;
    $btnRemark.textContent = "Sign & Submit";
  }
});

// ---------------------------------------------------------------------------
// 3. Sign raw message
// ---------------------------------------------------------------------------
// Signs an arbitrary message without submitting anything on-chain.
// Uses hostApi.signRaw() which routes the request through the Host's signing
// modal — the user sees and approves the message before signing.
//
// The payload format uses the versioned protocol (tag: "v1") and accepts
// either { tag: "Bytes", value: Uint8Array } or { tag: "Hex", value: "0x..." }.
//
// Returns a Result type (from neverthrow) — use .match() to handle ok/err.
// ---------------------------------------------------------------------------
$btnSignRaw.addEventListener("click", async () => {
  if (!providerAccounts.length) return;

  $btnSignRaw.disabled = true;

  try {
    const message = $rawInput.value || "Hello from starter kit!";
    const pubKey = providerAccounts[0].publicKey;

    log(`Signing raw: "${message}"...`);
    const result = await hostApi.signRaw({
      tag: "v1",
      value: {
        address: toHex(pubKey),
        data: { tag: "Bytes", value: new TextEncoder().encode(message) },
      },
    });

    result.match(
      (r) => log(`Signature: ${r.value.signature.slice(0, 24)}...`, "ok"),
      (e) => log(`Sign failed: ${e.value.name}`, "err"),
    );
  } catch (e) {
    log(`Sign raw failed: ${e.message}`, "err");
  } finally {
    $btnSignRaw.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// 4. Host storage
// ---------------------------------------------------------------------------
// The Host provides scoped key/value storage for each app. Data persists
// across page reloads and is isolated per domain.
//
// API:
//   hostLocalStorage.writeJSON(key, value) — serialize and store JSON
//   hostLocalStorage.readJSON(key)         — read and deserialize JSON
//   hostLocalStorage.clear(key)            — delete a key
//
// Also available: readBytes/writeBytes, readString/writeString for
// non-JSON data.
// ---------------------------------------------------------------------------
$btnStorWrite.addEventListener("click", async () => {
  try {
    const key = $storageKey.value;
    const val = JSON.parse($storageValue.value);
    await hostLocalStorage.writeJSON(key, val);
    log(`Wrote "${key}"`, "ok");
  } catch (e) {
    log(`Storage write failed: ${e.message}`, "err");
  }
});

$btnStorRead.addEventListener("click", async () => {
  try {
    const key = $storageKey.value;
    const val = await hostLocalStorage.readJSON(key);
    log(`Read "${key}" -> ${JSON.stringify(val)}`, "ok");
  } catch (e) {
    log(`Storage read failed: ${e.message}`, "err");
  }
});

$btnStorClear.addEventListener("click", async () => {
  try {
    const key = $storageKey.value;
    await hostLocalStorage.clear(key);
    log(`Cleared "${key}"`, "ok");
  } catch (e) {
    log(`Storage clear failed: ${e.message}`, "err");
  }
});

// ---------------------------------------------------------------------------
// 5. Chain read via createPapiProvider
// ---------------------------------------------------------------------------
// createPapiProvider(genesisHash) returns a JsonRpcProvider that routes
// all RPC calls through the Host's managed chain connection. This means:
//   - The Host handles the WebSocket lifecycle (connect, reconnect, etc.)
//   - You don't need a wsUrl — just the genesis hash
//   - Multiple apps sharing the same chain share one connection
//
// The returned provider plugs directly into polkadot-api's createClient().
// From there you can query storage, subscribe to blocks, etc. just like
// with a direct WebSocket provider.
//
// getUnsafeApi() gives you untyped access to any pallet storage/call.
// For typed access, generate types with polkadot-api's codegen tooling.
// ---------------------------------------------------------------------------
$btnChainRead.addEventListener("click", async () => {
  $btnChainRead.disabled = true;

  // Create a client using the Host-managed provider instead of a direct WS
  const provider = createPapiProvider(CHAIN.genesis);
  const client = createClient(provider);

  try {
    log(`Reading chain via Host provider (${CHAIN.name})...`);

    const block = await client.getFinalizedBlock();
    log(
      `Finalized block #${block.number}  hash: ${block.hash.slice(0, 18)}...`,
      "ok",
    );

    // Example: read the on-chain timestamp (Timestamp.Now storage query)
    const api = client.getUnsafeApi();
    try {
      const ts = await api.query.Timestamp.Now.getValue();
      log(`On-chain timestamp: ${new Date(Number(ts)).toISOString()}`, "ok");
    } catch {
      log("Timestamp.Now not available on this chain", "info");
    }

    client.destroy();
  } catch (e) {
    log(`Chain read failed: ${e.message}`, "err");
  } finally {
    $btnChainRead.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
init();
