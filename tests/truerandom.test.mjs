/**
 * Regression tests for the TrueRandom module, run with `npm test` (after `npm run build`).
 *
 * The module is written against browser + Foundry VTT globals, so this file stubs the small
 * surface it actually touches (Hooks, game.settings, ui.notifications, ChatMessage, fetch, a
 * couple of DOM calls) and drives the compiled `dist/` output the way Foundry would.
 *
 * Every assertion below fails against the pre-fix build, so it locks in real behaviour rather
 * than restating the implementation.
 */
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist");

const notifications = [];
const settings = new Map([
  ["truerandom.APIKEY", ""], ["truerandom.MAXCACHEDNUMBERS", 10], ["truerandom.UPDATEPOINT", 50],
  ["truerandom.DEBUG", false], ["truerandom.ENABLED", true], ["truerandom.QUICKTOGGLE", true],
  ["truerandom.SHOWSEEDS", false],
]);
const hooks = {};
globalThis.Hooks = {
  once: (n, f) => (hooks[n] ??= []).push(f),
  on:   (n, f) => (hooks[n] ??= []).push(f),
};
globalThis.game = {
  user: { isGM: true }, users: [],
  settings: {
    register: () => {},
    get: (ns, k) => { const key = `${ns}.${k}`; if (!settings.has(key)) throw new Error(`not registered: ${key}`); return settings.get(key); },
    set: (ns, k, v) => settings.set(`${ns}.${k}`, v),
  },
};
globalThis.CONFIG = { Dice: { randomUniform: () => 0.5 } };
globalThis.ChatMessage = { create: async () => {} };
globalThis.ui = { notifications: {
  info:  (m) => notifications.push(["info", m]),
  warn:  (m) => notifications.push(["warn", m]),
  error: (m) => notifications.push(["error", m]),
}};
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.document = { getElementById: () => null, createElement: () => ({ classList:{add(){},toggle(){}}, addEventListener(){}, style:{} }), querySelector: () => null, head:{appendChild(){}} };

let fetchMode = "ok";
globalThis.fetch = async () => {
  if (fetchMode === "network") throw new Error("getaddrinfo ENOTFOUND api.random.org");
  if (fetchMode === "http500") return { ok:false, status:503, statusText:"Service Unavailable", json: async () => { throw new Error("not json"); } };
  if (fetchMode === "html")    return { ok:true, status:200, json: async () => { throw new SyntaxError("Unexpected token <"); } };
  if (fetchMode === "rpcerr")  return { ok:true, status:200, json: async () => ({ jsonrpc:"2.0", id:0, error:{ code:402, message:"The API key ... has already used its allowance of requests" } }) };
  if (fetchMode === "lowbits") return { ok:true, status:200, json: async () => ({ jsonrpc:"2.0", id:0, result:{ random:{ data:[0.1,0.2,0.3,0.4,0.5], completionTime:"" }, bitsUsed:200, bitsLeft:150, requestsLeft:500, advisoryDelay:100 } }) };
  return { ok:true, status:200, json: async () => ({ jsonrpc:"2.0", id:0, result:{ random:{ data:[0.11,0.22,0.33,0.44,0.55,0.66,0.77,0.88,0.99,0.101], completionTime:"" }, bitsUsed:200, bitsLeft:200000, requestsLeft:900, advisoryDelay:100 } }) };
};

await import(`${DIST}/TrueRandom.js`);

const tr = globalThis.TrueRandom;
const flush = () => new Promise(r => setTimeout(r, 20));
let pass = 0, fail = 0;
const check = (name, cond, extra="") => { if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name} ${extra}`); } };

console.log("\n--- 1. no API key: GM warned once, falls back, no crash ---");
tr.Enabled = true; tr.RandomGenerator = null;
const a = tr.GetRandomNumber(), b = tr.GetRandomNumber();
check("returns a number in [0,1)", typeof a === "number" && a >= 0 && a < 1, `got ${a}`);
check("warned exactly once", notifications.filter(n => n[1].includes("No random.org API key")).length === 1, JSON.stringify(notifications));

console.log("\n--- 2. module disabled: silent fallback, NO warning (bug #3) ---");
notifications.length = 0; tr.HasAlerted = false; tr.Enabled = false;
tr.GetRandomNumber(); tr.GetRandomNumber();
check("no notification while disabled", notifications.length === 0, JSON.stringify(notifications));

console.log("\n--- 3. API failure modes each produce ONE readable error notification ---");
for (const [mode, expect] of [["network","Could not reach"],["http500","HTTP 503"],["html","malformed"],["rpcerr","random.org error 402"]]) {
  notifications.length = 0; fetchMode = mode; tr.Enabled = true;
  tr.UpdateAPIKey("test-key"); await flush();
  const errs = notifications.filter(n => n[0] === "error");
  check(`${mode}: one error notification`, errs.length === 1, JSON.stringify(notifications));
  check(`${mode}: message contains "${expect}"`, errs[0]?.[1].includes(expect), errs[0]?.[1]);
  check(`${mode}: no "[object Object]"`, !errs[0]?.[1].includes("[object Object]"), errs[0]?.[1]);
}

console.log("\n--- 4. repeated failures notify once, and back off instead of hammering ---");
notifications.length = 0; fetchMode = "network"; tr.UpdateAPIKey("test-key"); await flush();
const firstRetry = tr.NextRetryTime;
let calls = 0; const realFetch = globalThis.fetch;
globalThis.fetch = async (...args) => { calls++; return realFetch(...args); };
for (let i = 0; i < 50; i++) tr.GetRandomNumber();
await flush();
check("one error notification for the whole outage", notifications.filter(n => n[0]==="error").length === 1, JSON.stringify(notifications));
check("50 rolls during backoff made 0 further requests", calls === 0, `made ${calls}`);
check("backoff window is in the future", firstRetry > Date.now(), `${firstRetry - Date.now()}ms`);
globalThis.fetch = realFetch;

console.log("\n--- 5. recovery clears the outage and says so ---");
notifications.length = 0; fetchMode = "ok"; tr.NextRetryTime = 0;
tr.UpdateRandomNumbers(); await flush();
check("info notification on recovery", notifications.some(n => n[0]==="info" && n[1].includes("restored")), JSON.stringify(notifications));
check("cache refilled", tr.RandomNumbers.length === 10, `${tr.RandomNumbers.length}`);
check("failure state cleared", tr.HasNotifiedApiFailure === false && tr.ApiFailureCount === 0);

console.log("\n--- 6. cached numbers are actually served ---");
const before = tr.RandomNumbers.length;
const v = tr.GetRandomNumber();
check("consumed one cached number", tr.RandomNumbers.length === before - 1, `${before} -> ${tr.RandomNumbers.length}`);
check("value in [0,1)", v >= 0 && v < 1, `${v}`);

console.log("\n--- 7. quota warning fires once, with honest wording ---");
notifications.length = 0; fetchMode = "lowbits";
tr.UpdateAPIKey("test-key"); await flush();
tr.NextRetryTime = 0; tr.UpdateRandomNumbers(); await flush();
const warns = notifications.filter(n => n[0]==="warn" && n[1].includes("allowance"));
check("exactly one quota warning", warns.length === 1, JSON.stringify(notifications));
check("says 'nearly used up', not 'exhausted'", warns[0]?.[1].includes("nearly used up"), warns[0]?.[1]);

console.log("\n--- 7b. a failure BEFORE ui.notifications exists is re-raised, not swallowed ---");
{
  const savedUi = globalThis.ui;
  notifications.length = 0; fetchMode = "network";
  globalThis.ui = undefined;                            // pre-'ready': no ui.notifications yet
  tr.UpdateAPIKey("test-key"); await flush();           // resets flags, then fails with no UI
  check("nothing latched while the UI was unavailable", tr.HasNotifiedApiFailure === false, `${tr.HasNotifiedApiFailure}`);
  check("a pending notice is remembered", tr.PendingApiFailureNotice === true, `${tr.PendingApiFailureNotice}`);
  globalThis.ui = savedUi;                              // now Foundry is ready
  tr.NextRetryTime = 0; tr.UpdateRandomNumbers(); await flush();
  check("the warning is re-raised once the UI exists", notifications.filter(n => n[0]==="error").length === 1, JSON.stringify(notifications));
  check("and latches only now", tr.HasNotifiedApiFailure === true);
}

console.log("\n--- 7c. missing key before game.user exists still warns the GM later ---");
{
  const savedUser = game.user;
  notifications.length = 0;
  tr.Enabled = true; tr.RandomGenerator = null; tr.HasAlerted = false;
  game.user = undefined;                                // pre-'ready': no user yet
  tr.GetRandomNumber();
  check("no latch without a user", tr.HasAlerted === false, `${tr.HasAlerted}`);
  game.user = savedUser;
  tr.GetRandomNumber(); tr.GetRandomNumber();
  const keyWarns = notifications.filter(n => n[1].includes("No random.org API key"));
  check("GM warned exactly once afterwards", keyWarns.length === 1, JSON.stringify(notifications));
}

console.log("\n--- 8. Debug honours the (now correctly-named) setting ---");
const { Debug } = await import(`${DIST}/Debug.js`);
settings.set("truerandom.DEBUG", false);
check("DEBUG=false -> disabled", Debug.Enabled === false, `${Debug.Enabled}`);
settings.set("truerandom.DEBUG", true);
check("DEBUG=true -> enabled", Debug.Enabled === true, `${Debug.Enabled}`);

console.log("\n--- 9. RandomAPI is exposed on globalThis (the old `Window[...]` write was a silent no-op) ---");
check("globalThis.RandomAPI defined", typeof globalThis.RandomAPI === "function", `${typeof globalThis.RandomAPI}`);

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
