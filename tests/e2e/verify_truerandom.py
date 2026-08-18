#!/usr/bin/env python3
"""Live-verify the TrueRandom module in a real Foundry VTT world (page context).

Covers what the node suite cannot: the actual Foundry hooks, the v13+ chat DOM, and
CONFIG.Dice.randomUniform being driven by a genuine Roll.

Usage: ~/.venvs/playwright/bin/python tests/e2e/verify_truerandom.py [URL]
"""
import json, sys, time
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://192.168.11.36:30001"

ENABLE_JS = """
async () => {
  const cfg = game.settings.get("core", "moduleConfiguration") ?? {};
  if (cfg["truerandom"] === true) return "already-enabled";
  cfg["truerandom"] = true;
  await game.settings.set("core", "moduleConfiguration", cfg);
  return "enabled";
}
"""

VERIFY_JS = r"""
async () => {
  const out = { errors: [] };
  const tr = globalThis.TrueRandom;
  out.module_active = !!game.modules.get("truerandom")?.active;
  out.global_TrueRandom = !!tr;
  out.global_RandomAPI = typeof globalThis.RandomAPI;          // was never exposed before the fix
  out.randomUniform_hijacked = CONFIG.Dice.randomUniform !== Math.random;

  // --- settings all registered under the lowercase module id ---
  const keys = ["APIKEY","MAXCACHEDNUMBERS","UPDATEPOINT","DEBUG","ENABLED","QUICKTOGGLE","SHOWSEEDS"];
  out.settings = {};
  for (const k of keys) {
    try { out.settings[k] = game.settings.get("truerandom", k); }
    catch (e) { out.settings[k] = `THREW: ${e.message}`; }
  }

  // --- the DEBUG setting is actually readable under the id Debug.ts now uses ---
  try { game.settings.get("truerandom", "DEBUG"); out.debug_namespace_ok = true; }
  catch (e) { out.debug_namespace_ok = false; out.errors.push("DEBUG namespace: " + e.message); }
  try { game.settings.get("TrueRandom", "DEBUG"); out.old_namespace_still_works = true; }
  catch (e) { out.old_namespace_still_works = false; }   // expected false: proves the old key was dead

  // --- quick toggle button really is in the live chat controls ---
  const btn = document.getElementById("TrueRandomQuickToggleButton");
  out.button_present = !!btn;
  out.button_connected = !!btn?.isConnected;
  out.button_parent_id = btn?.parentElement?.id ?? null;
  out.button_label = btn?.innerHTML ?? null;
  out.chat_controls_exists = !!document.querySelector("#chat-controls");
  out.style_injected_once = document.querySelectorAll("#TrueRandomQuickToggleStyle").length;

  // --- re-attaching is idempotent: no duplicate button, no duplicate style ---
  tr.GenerateQuickToggleButton(true);
  tr.GenerateQuickToggleButton(true);
  out.buttons_after_reattach = document.querySelectorAll("#TrueRandomQuickToggleButton").length;
  out.styles_after_reattach = document.querySelectorAll("#TrueRandomQuickToggleStyle").length;

  // --- simulate the v13+ re-parent: orphan the button, then let the hook re-home it ---
  btn?.remove();
  out.button_after_orphan = !!document.getElementById("TrueRandomQuickToggleButton");
  tr.GenerateQuickToggleButton(true);
  const rehomed = document.getElementById("TrueRandomQuickToggleButton");
  out.button_rehomed = !!rehomed?.isConnected;
  out.rehomed_parent_id = rehomed?.parentElement?.id ?? null;
  out.buttons_after_rehome = document.querySelectorAll("#TrueRandomQuickToggleButton").length;

  // --- a real Roll flows through the module without an API key, falling back cleanly ---
  tr.RandomGenerator = null; tr.RandomNumbers = []; tr.Enabled = true; tr.HasAlerted = false;
  const rolls = [];
  for (let i = 0; i < 20; i++) rolls.push((await new Roll("1d20").evaluate()).total);
  out.roll_sample = rolls;
  out.rolls_in_range = rolls.every(r => r >= 1 && r <= 20);
  out.rolls_varied = new Set(rolls).size > 1;

  // --- disabled module must NOT warn (the old code raised a MISSING API KEY dialog) ---
  tr.Enabled = false; tr.HasAlerted = false;
  const before = document.querySelectorAll("#notifications .notification").length;
  for (let i = 0; i < 5; i++) await new Roll("1d20").evaluate();
  out.notifications_while_disabled = document.querySelectorAll("#notifications .notification").length - before;
  out.dialogs_while_disabled = document.querySelectorAll(".dialog, dialog.application").length;
  tr.Enabled = true;

  // --- a broken API surfaces ONE readable, non-"[object Object]" notification ---
  const realFetch = window.fetch;
  let fetchCalls = 0;
  window.fetch = async () => { fetchCalls++; throw new TypeError("Failed to fetch"); };
  tr.HasAlerted = true;
  tr.UpdateAPIKey("live-test-bad-key");
  await new Promise(r => setTimeout(r, 800));
  const texts = [...document.querySelectorAll("#notifications .notification")].map(n => n.textContent.trim());
  // count only the OUTAGE notice; the "no API key" warning from the keyless phase above is a
  // different (also correct) message that is still sitting in the notification area.
  out.failure_notifications = texts.filter(t => t.includes("Could not fetch random numbers"));
  out.failure_notification_count = out.failure_notifications.length;
  out.all_truerandom_notifications = texts.filter(t => t.includes("TrueRandom |"));
  out.has_object_object = texts.some(t => t.includes("[object Object]"));

  // --- and backs off instead of one request per roll ---
  const callsAfterFirst = fetchCalls;
  for (let i = 0; i < 25; i++) await new Roll("1d20").evaluate();
  await new Promise(r => setTimeout(r, 300));
  out.fetch_calls_during_backoff = fetchCalls - callsAfterFirst;
  out.next_retry_in_ms = tr.NextRetryTime - Date.now();
  window.fetch = realFetch;

  return out;
}
"""

def main():
    page_errors, console_errors = [], []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.on("pageerror", lambda e: page_errors.append(str(e)))
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)

        # join as the Gamemaster
        page.goto(f"{URL}/join", wait_until="networkidle", timeout=90000)
        page.wait_for_timeout(1500)
        page.select_option("select[name='userid']", index=1)
        page.click("button[type='submit'], button[name='join']")
        page.wait_for_function("() => globalThis.game?.ready === true", timeout=120000)

        # make sure the module is on; enabling requires a reload to take effect
        state = page.evaluate(ENABLE_JS)
        print(f"module: {state}")
        if state == "enabled":
            page.reload(wait_until="networkidle", timeout=90000)
            page.wait_for_function("() => globalThis.game?.ready === true", timeout=120000)
        page.wait_for_timeout(2500)

        result = page.evaluate(VERIFY_JS)
        browser.close()

    print(json.dumps(result, indent=2))
    print(f"\npage_errors: {page_errors}")
    print(f"console_errors: {[e for e in console_errors if 'random.org' not in e][:5]}")

    checks = [
        ("module active",                    result["module_active"] is True),
        ("TrueRandom global exposed",        result["global_TrueRandom"] is True),
        ("RandomAPI global exposed",         result["global_RandomAPI"] == "function"),
        ("randomUniform hijacked",           result["randomUniform_hijacked"] is True),
        ("all 7 settings registered",        all(not str(v).startswith("THREW") for v in result["settings"].values())),
        ("DEBUG readable as 'truerandom'",   result["debug_namespace_ok"] is True),
        ("old 'TrueRandom' key was dead",    result["old_namespace_still_works"] is False),
        ("#chat-controls exists in v14",     result["chat_controls_exists"] is True),
        ("button attached to chat controls", result["button_connected"] is True and result["button_parent_id"] == "chat-controls"),
        ("style injected exactly once",      result["style_injected_once"] == 1),
        ("re-attach makes no duplicate",     result["buttons_after_reattach"] == 1 and result["styles_after_reattach"] == 1),
        ("orphaned button is re-homed",      result["button_rehomed"] is True and result["buttons_after_rehome"] == 1),
        ("real rolls stay in 1..20",         result["rolls_in_range"] is True),
        ("real rolls vary",                  result["rolls_varied"] is True),
        ("disabled -> no notification",      result["notifications_while_disabled"] == 0),
        ("disabled -> no dialog",            result["dialogs_while_disabled"] == 0),
        ("API failure -> exactly 1 outage notice", result["failure_notification_count"] == 1),
        ("no '[object Object]'",             result["has_object_object"] is False),
        ("backoff: 0 refetch in 25 rolls",   result["fetch_calls_during_backoff"] == 0),
        ("no uncaught page errors",          len(page_errors) == 0),
    ]
    print()
    failed = 0
    for name, ok in checks:
        print(f"  {'PASS' if ok else 'FAIL'}  {name}")
        failed += 0 if ok else 1
    print(f"\n===== {len(checks)-failed} passed, {failed} failed =====")
    return 1 if failed else 0

if __name__ == "__main__":
    sys.exit(main())
