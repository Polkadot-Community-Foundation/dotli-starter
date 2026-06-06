import {
  isInsideContainer,
  getAccountsProvider,
  getTruApi,
  getHostLocalStorage,
  getHostProvider,
} from "@parity/product-sdk-host";

import { Binary, createClient } from "polkadot-api";
import { toHex } from "polkadot-api/utils";

const CHAIN = {
  name: "Paseo Next v2 Asset Hub",
  genesis:
    "0xbf0488dbe9daa1de1c08c5f743e26fdc2a4ecd74cf87dd1b4b1eeb99ae4ef19f",
};

const STORAGE_KEY = "starter_message";
const FAUCET_URL = "https://faucet.polkadot.io";

// polkadot-api throws TxValidityError-like objects when the runtime rejects a
// tx pre-dispatch. The shape we care about is {type: "Invalid", value: {type:
// "Payment"}} — emitted when the signer can't pay the fee, which for a fresh
// account just means "go top up". Some versions expose those fields on the
// error itself; others stash the JSON in .message. Check both.
function isInsufficientFundsError(error) {
  if (!error) return false;
  if (error.type === "Invalid" && error.value?.type === "Payment") return true;
  if (typeof error.message === "string") {
    try {
      const parsed = JSON.parse(error.message);
      if (parsed?.type === "Invalid" && parsed?.value?.type === "Payment") {
        return true;
      }
    } catch {
      // fall through to substring check
    }
    return /"Invalid"[\s\S]*"Payment"/.test(error.message);
  }
  return false;
}

// The dotli host binds each product to a DotNS identifier; signing calls fail
// with PermissionDenied if the signer's identifier doesn't match the URL the
// host loaded. Mirrors the rule the host-playground uses so the same build
// works under `localhost:4173`, `<name>.dot`, and `<sub>.<name>.dot` previews.
function deriveSelfDotNs() {
  if (typeof window === "undefined") return "";
  const hostname = window.location.hostname.toLowerCase();
  const host = window.location.host.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".localhost")
  ) {
    return host;
  }
  if (hostname.endsWith(".dot")) {
    const segments = hostname.split(".");
    return segments.length > 2 ? segments.slice(-2).join(".") : hostname;
  }
  const segments = hostname.split(".");
  if (segments.length >= 3) {
    let label = segments.slice(0, -2);
    if (label[label.length - 1] === "app") label = label.slice(0, -1);
    if (label.length > 0) return `${label.join(".")}.dot`;
  }
  return hostname;
}

const SELF_DOTNS = deriveSelfDotNs();

const $identityName = document.getElementById("identity-name");
const $identityAddress = document.getElementById("identity-address");
const $transportBadge = document.getElementById("transport-badge");
const $statusText = document.getElementById("status-text");
const $dotnsLabel = document.getElementById("dotns-label");
const $messageInput = document.getElementById("message-input");
const $btnRemark = document.getElementById("btn-remark");
const $btnSignRaw = document.getElementById("btn-sign-raw");
const $btnStorageSave = document.getElementById("btn-storage-save");
const $btnStorageLoad = document.getElementById("btn-storage-load");
const $btnStorageClear = document.getElementById("btn-storage-clear");
const $btnChainRead = document.getElementById("btn-chain-read");
const $btnClear = document.getElementById("btn-clear");
const $log = document.getElementById("log");

const actionButtons = [
  $btnRemark,
  $btnSignRaw,
  $btnStorageSave,
  $btnStorageLoad,
  $btnStorageClear,
  $btnChainRead,
];

let accountsProvider = null;
let productAccount = null;

function log(message, level = "info") {
  const ts = new Date().toLocaleTimeString();
  const klass = level === "ok" ? "ok" : level === "err" ? "err" : "info";
  $log.innerHTML += `<span class="ts">[${ts}]</span> <span class="${klass}">${message}</span>\n`;
  $log.scrollTop = $log.scrollHeight;
}

function setBadge(text, variant) {
  $transportBadge.textContent = text;
  $transportBadge.className = `badge ${variant}`;
}

function setActionsEnabled(enabled) {
  for (const button of actionButtons) button.disabled = !enabled;
}

function renderAccountState() {
  if (productAccount) {
    $identityName.textContent = `Product account · ${SELF_DOTNS}`;
    $identityAddress.textContent = toHex(productAccount.publicKey);
    $statusText.textContent = `Connected to ${CHAIN.name}`;
    setActionsEnabled(true);
  } else {
    $identityName.textContent = "Not signed in";
    $identityAddress.textContent = "Open this page inside the host and sign in.";
    $statusText.textContent = "Waiting for login";
    setActionsEnabled(false);
  }
}

async function refreshAccount() {
  if (!accountsProvider) return;
  const result = await accountsProvider.getProductAccount(SELF_DOTNS, 0);
  result.match(
    (account) => {
      productAccount = account;
      log(`Product account ready for ${SELF_DOTNS}`, "ok");
    },
    (err) => {
      productAccount = null;
      log(`getProductAccount(${SELF_DOTNS}) failed: ${err.name}`, "err");
    },
  );
  renderAccountState();
}

async function withBusy(button, busyText, fn) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = busyText;

  try {
    await fn();
  } finally {
    button.textContent = originalText;
    renderAccountState();
  }
}

function getMessage() {
  return $messageInput.value.trim() || "Hello from dotli starter";
}

$btnClear.addEventListener("click", () => {
  $log.innerHTML = "";
});

$btnRemark.addEventListener("click", async () => {
  if (!productAccount || !accountsProvider) return;

  await withBusy($btnRemark, "Submitting...", async () => {
    const provider = await getHostProvider(CHAIN.genesis);
    if (!provider) {
      log("getHostProvider returned null — not inside a host container", "err");
      return;
    }
    const client = createClient(provider);

    try {
      log(`Connecting to ${CHAIN.name} via host provider...`);
      await client.getFinalizedBlock();

      const signer = accountsProvider.getProductAccountSigner(productAccount);
      const api = client.getUnsafeApi();
      const tx = api.tx.System.remark({
        remark: Binary.fromText(getMessage()),
      });

      log("Signing and submitting remark...");

      await new Promise((resolve, reject) => {
        tx.signSubmitAndWatch(signer).subscribe({
          next(event) {
            if (event.type === "txBestBlocksState" && event.found) {
              log("Remark included in best block");
            } else if (event.type === "finalized") {
              log(
                `Remark finalized in ${event.block.hash.slice(0, 18)}...`,
                "ok",
              );
              resolve();
            }
          },
          error(error) {
            reject(error);
          },
        });
      });
    } catch (error) {
      if (isInsufficientFundsError(error)) {
        log("Remark failed: account has no balance to pay fees", "err");
        log(
          `Fund this account at <a href="${FAUCET_URL}" target="_blank" rel="noopener noreferrer">${FAUCET_URL}</a>, then try again.`,
          "info",
        );
      } else {
        log(`Remark failed: ${error.message}`, "err");
      }
    } finally {
      client.destroy();
    }
  });
});

$btnSignRaw.addEventListener("click", async () => {
  if (!productAccount) return;

  await withBusy($btnSignRaw, "Signing...", async () => {
    try {
      const truApi = await getTruApi();
      if (!truApi) {
        log("getTruApi returned null — not inside a host container", "err");
        return;
      }

      const result = await truApi.signRaw({
        tag: "v1",
        value: {
          account: [SELF_DOTNS, 0],
          payload: {
            tag: "Bytes",
            value: new TextEncoder().encode(getMessage()),
          },
        },
      });

      result.match(
        (value) =>
          log(`Signed: ${toHex(value.value.signature).slice(0, 20)}...`, "ok"),
        (error) => log(`Sign failed: ${error.value.name}`, "err"),
      );
    } catch (error) {
      log(`Sign raw failed: ${error.message}`, "err");
    }
  });
});

$btnStorageSave.addEventListener("click", async () => {
  await withBusy($btnStorageSave, "Saving...", async () => {
    try {
      const storage = await getHostLocalStorage();
      if (!storage) {
        log("getHostLocalStorage returned null", "err");
        return;
      }
      await storage.writeJSON(STORAGE_KEY, {
        message: getMessage(),
        updatedAt: new Date().toISOString(),
      });
      log(`Saved draft to "${STORAGE_KEY}"`, "ok");
    } catch (error) {
      log(`Storage save failed: ${error.message}`, "err");
    }
  });
});

$btnStorageLoad.addEventListener("click", async () => {
  await withBusy($btnStorageLoad, "Loading...", async () => {
    try {
      const storage = await getHostLocalStorage();
      if (!storage) {
        log("getHostLocalStorage returned null", "err");
        return;
      }
      const payload = await storage.readJSON(STORAGE_KEY);
      if (!payload || typeof payload.message !== "string") {
        log(`No saved draft under "${STORAGE_KEY}"`, "info");
        return;
      }

      $messageInput.value = payload.message;
      log(`Loaded draft from "${STORAGE_KEY}"`, "ok");
    } catch (error) {
      log(`Storage load failed: ${error.message}`, "err");
    }
  });
});

$btnStorageClear.addEventListener("click", async () => {
  await withBusy($btnStorageClear, "Clearing...", async () => {
    try {
      const storage = await getHostLocalStorage();
      if (!storage) {
        log("getHostLocalStorage returned null", "err");
        return;
      }
      await storage.clear(STORAGE_KEY);
      log(`Cleared "${STORAGE_KEY}"`, "ok");
    } catch (error) {
      log(`Storage clear failed: ${error.message}`, "err");
    }
  });
});

$btnChainRead.addEventListener("click", async () => {
  await withBusy($btnChainRead, "Reading...", async () => {
    const provider = await getHostProvider(CHAIN.genesis);
    if (!provider) {
      log("getHostProvider returned null — not inside a host container", "err");
      return;
    }
    const client = createClient(provider);

    try {
      log(`Reading finalized state from ${CHAIN.name}...`);

      const block = await client.getFinalizedBlock();
      log(`Finalized block #${block.number}`, "ok");

      const api = client.getUnsafeApi();
      try {
        const timestamp = await api.query.Timestamp.Now.getValue();
        log(`Chain time: ${new Date(Number(timestamp)).toISOString()}`, "ok");
      } catch {
        log("Timestamp.Now is unavailable on this chain", "info");
      }
    } catch (error) {
      log(`Chain read failed: ${error.message}`, "err");
    } finally {
      client.destroy();
    }
  });
});

async function init() {
  log("Initializing host bridge...");
  setActionsEnabled(false);
  setBadge("Initializing", "warn");
  if ($dotnsLabel) $dotnsLabel.textContent = SELF_DOTNS || "—";

  try {
    const inside = await isInsideContainer();
    if (!inside) {
      $identityName.textContent = "Not running in host";
      $identityAddress.textContent =
        "This starter needs the dotli host environment.";
      $statusText.textContent = "Host bridge unavailable";
      setBadge("Unavailable", "err");
      log("Host bridge unavailable", "err");
      return;
    }

    accountsProvider = await getAccountsProvider();
    if (!accountsProvider) {
      log("getAccountsProvider returned null", "err");
      setBadge("Unavailable", "err");
      return;
    }

    // Establish the host signing session by reading the user's legacy
    // accounts. The desktop host is permissive and will sign without this
    // handshake; the mobile host won't — its signing transport stays
    // un-wired and prompts never reach the paired device. SignerManager
    // .connect() does this implicitly; the raw accounts-provider flow
    // doesn't, so we have to do it ourselves.
    log("Establishing signing session...");
    await accountsProvider.getLegacyAccounts().match(
      (legacy) => log(`Session ready (${legacy.length} legacy account(s))`),
      (err) => log(`getLegacyAccounts failed: ${err?.name ?? err}`, "err"),
    );

    // Without ChainSubmit, the host silently rejects every signing request
    // (signRaw and signSubmitAndWatch alike) — the prompt never reaches the
    // paired mobile and the in-page "Signing..." spinner hangs forever.
    log("Requesting ChainSubmit permission...");
    const truApi = await getTruApi();
    if (!truApi) {
      log("getTruApi returned null", "err");
      setBadge("Unavailable", "err");
      return;
    }
    const permResult = await truApi.permission({
      tag: "v1",
      value: { tag: "ChainSubmit", value: undefined },
    });
    const granted = permResult.match(
      (res) => res.value,
      (err) => {
        log(`ChainSubmit permission failed: ${err.value.name}`, "err");
        return false;
      },
    );
    if (!granted) {
      log("ChainSubmit permission denied — signing won't work", "err");
      setBadge("Permission denied", "err");
      return;
    }
    log("ChainSubmit permission granted", "ok");

    setBadge("Connected", "ok");
    await refreshAccount();

    accountsProvider.subscribeAccountConnectionStatus(async (status) => {
      log(`Account status: ${status}`, "info");
      if (status === "connected") {
        setBadge("Connected", "ok");
        await refreshAccount();
      } else if (status === "connecting") {
        setBadge("Connecting", "warn");
      } else {
        setBadge("Disconnected", "err");
        productAccount = null;
        renderAccountState();
      }
    });
  } catch (error) {
    $identityName.textContent = "Initialization failed";
    $identityAddress.textContent = error.message;
    $statusText.textContent = "Error";
    setBadge("Error", "err");
    log(`Init failed: ${error.message}`, "err");
  }
}

init();
