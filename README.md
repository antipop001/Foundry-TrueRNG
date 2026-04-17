# TrueRandom for Foundry VTT

This module replaces Foundry VTT's built-in pseudo-random number generator with true random numbers from [random.org](https://random.org), providing atmospheric noise-based randomness for all dice rolls.

## Features

- **True Randomness**: Uses random.org's atmospheric noise-based random number generation
- **Seamless Integration**: Automatically replaces all dice rolls with true random numbers
- **Smart Caching**: Fetches numbers in batches to minimize API usage
- **GM Controls**: Quick toggle button and comprehensive settings
- **Seed Transparency**: Optional display of fetched random seeds in chat
- **Foundry v14 Compatible**: Updated for the latest Foundry VTT version
- **Automatic Fallback**: Uses standard randomness if API is unavailable

## Installation

1. Install the module using this manifest URL in Foundry VTT:
   ```
   https://raw.githubusercontent.com/antipop001/Foundry-TrueRNG/master/module.json
   ```

2. Get a free API key from [random.org dashboard](https://api.random.org/dashboard)

3. As Game Master, go to **Game Settings → Module Settings → TrueRandom**

4. Paste your API key in the **"Random.org API Key"** field

5. Save changes - all dice rolls will now use true randomness!

## Configuration

### Core Settings

- **Random.org API Key** (Required): Your API key from random.org dashboard
- **Enabled**: Toggle TrueRandom on/off globally
- **Max Cached Numbers** (5-200): Number of random values to fetch per batch
- **Update Point** (1-100%): Cache refill threshold percentage

### Display Options

- **Show Quick Toggle Button**: Display RndON/RndOFF button above chat (GM only)
- **Show Seeds in Chat**: Display fetched random seeds as GM whispers for transparency
- **Print Debug Messages**: Enable console logging for troubleshooting

## How It Works

TrueRandom operates transparently by replacing Foundry's core random number generator (`CONFIG.Dice.randomUniform`). When enabled:

1. **Fetches** batches of true random numbers from random.org
2. **Caches** them locally for performance
3. **Uses** them for all dice rolls (attack rolls, damage, skill checks, etc.)
4. **Refills** cache automatically when running low
5. **Falls back** to standard randomness if API issues occur

## API Usage Optimization

The free random.org developer API has daily limits. TrueRandom optimizes usage by:

- **Batch fetching**: Gets multiple numbers per API call
- **Smart caching**: Only fetches when cache is below threshold
- **Timestamp indexing**: Uses current time to randomize which cached number is used

### Recommendations

- **Small groups/light usage**: Keep Max Cached Numbers low (5-20)
- **Large groups/heavy dice games**: Increase Max Cached Numbers (50-100)
- **Frequent page reloads**: Lower cache size to reduce waste

## Verification

To verify TrueRandom is working:

1. Enable **"Show Seeds in Chat"** to see fetched random values
2. Check browser console for TrueRandom debug messages
3. Look for **RndON** button above chat (GMs only)
4. Test with: `console.log(TrueRandom.RandomNumbers.length)` in browser console

## Compatibility

- **Foundry VTT**: v13-v14+ (uses modern ES modules)
- **Systems**: All systems (operates at core dice level)
- **Modules**: Compatible with other modules

## Implementation Notes

TrueRandom enhances randomness without changing gameplay:

- **Invisible to players**: Dice interface looks identical
- **Works with all systems**: PF2e, D&D 5e, etc.
- **Maintains game balance**: True randomness vs. pseudo-randomness
- **Session persistent**: Cache survives page refreshes

## Troubleshooting

**No settings visible**: Ensure module is enabled and you're logged in as GM

**Button not showing**: Only GMs see the toggle button, and it requires chat interface

**Seeds not displaying**: Enable "Show Seeds in Chat" and check GM whispers

**API errors**: Verify API key and check daily quota at random.org

## Credits

- **Original Author**: kidfearless
- **Current Maintainer**: antipop001
- **API Provider**: [RANDOM.ORG](https://random.org)

## Support

If you encounter issues, please report them on the [GitHub repository](https://github.com/antipop001/Foundry-TrueRNG).

---

*Experience true randomness in your tabletop adventures with atmospheric noise from random.org!*