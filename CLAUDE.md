# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TrueRandom is a Foundry VTT module that replaces the built-in random number generator with true random numbers from random.org. The module integrates with Foundry's dice system by hijacking `CONFIG.Dice.randomUniform` and provides a caching mechanism to reduce API calls.

## Development Commands

- `npm run build` - Compiles TypeScript source files to JavaScript in the `dist/` directory
- `npm test` - Runs `tests/truerandom.test.mjs` against the compiled `dist/` output
- `npm run check` - `build` followed by `test`
- `tsc` - Direct TypeScript compilation (equivalent to build)

No linting is configured.

### Testing

`tests/truerandom.test.mjs` stubs the small slice of browser + Foundry globals the module touches
(`Hooks`, `game.settings`, `ui.notifications`, `ChatMessage`, `fetch`) and drives the compiled
`dist/` output. It covers the keyless and disabled fallbacks, every random.org failure mode, the
once-per-outage notification and its retry backoff, recovery, the quota warning, and the pre-`ready`
case where `ui.notifications` does not exist yet. Run it after every `npm run build`.

`tests/e2e/verify_truerandom.py` is the live counterpart: it drives a real Foundry world over
Playwright (`~/.venvs/playwright/bin/python tests/e2e/verify_truerandom.py <URL>`) and checks the
things stubs cannot — the real chat DOM, the hooks, and `CONFIG.Dice.randomUniform` under a genuine
`Roll`. It needs a Foundry instance with the module installed and enabled.

### Cross-model review gate

`tools/agy_check/` runs an independent reviewer (Antigravity / Gemini) over an uncommitted fix and
returns APPROVE / REVISE. Because this module's correctness rests on Foundry and random.org API
assumptions that no local test can validate, use it for non-trivial changes. See
`tools/agy_check/README.md`.

## Architecture

### Core Components

- **TrueRandom.ts** - Main module class that manages random number generation, caching, API integration, and Foundry VTT hooks
- **RandomAPI.ts** - HTTP client for random.org's JSON-RPC API with error handling and quota tracking
- **JsonRPC.ts** - JSON-RPC request/response wrapper classes for API communication
- **interfaces.ts** - TypeScript interfaces defining random.org API parameters and response structures
- **BrowserConfig.ts** - LocalStorage utility for persisting API keys across sessions

### Key Integration Points

- Hooks into Foundry's `CONFIG.Dice.randomUniform` during the 'init' hook to replace the default RNG
- Registers module settings for API key, cache size, update threshold, debug mode, and quick toggle
- Creates a quick toggle button in the chat controls area for GMs
- Maintains backward compatibility by preserving the original random function as fallback

### Data Flow

1. Module initializes and replaces Foundry's RNG function
2. When dice are rolled, `TrueRandom.GetRandomNumber()` is called
3. If cache is empty or API key missing, falls back to `Math.random()`
4. Random numbers are fetched from random.org in batches and cached locally
5. Numbers are consumed from cache using timestamp-based indexing for unpredictability
6. Cache is automatically refilled when it drops below the configured threshold

### API failure handling

A failed fetch (network error, non-`ok` HTTP status, non-JSON body, or a JSON-RPC `error` object)
raises a single user-facing notification per outage rather than one per roll, and sets a linear
retry backoff (`TrueRandom.RetryDelayMs` per consecutive failure, capped at `MaxRetryDelayMs`) so a
broken API is not hit once per die. A later success clears the state and reports recovery. The
"already notified" flags only latch once a notification was genuinely displayed, because
`ui.notifications` does not exist before Foundry's `ready` hook.

### Module Configuration

The module registers several Foundry VTT settings:
- `APIKEY` - Random.org developer API key (world scope)
- `MAXCACHEDNUMBERS` - Number of random numbers to cache (world scope, 5-200 range)
- `UPDATEPOINT` - Percentage threshold for cache refill (world scope, 1-100 range)
- `ENABLED` - Module on/off toggle (world scope)
- `QUICKTOGGLE` - Show/hide quick toggle button (client scope)
- `SHOWSEEDS` - Whisper fetched seeds to GMs for transparency (world scope)
- `DEBUG` - Enable debug console output (client scope)

All settings are registered under the lowercase module id `truerandom`. Reading them under any other
casing throws — this was a live bug in `Debug.ts` that silently forced debug logging on.

## Build Output

The TypeScript compiler outputs to `dist/TrueRandom.js` which is the main script file referenced in `module.json`.