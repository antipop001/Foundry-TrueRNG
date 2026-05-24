import { Debug } from "./Debug.js";
import { RandomAPI } from "./RandomAPI.js";
import { Ref } from './Types.js';
import { LocalStorage } from './BrowserConfig.js';
export class TrueRandom {
    constructor() {
        this.RandomNumbers = [];
        this.RandomGenerator = null;
        this.OriginalRandomFunction = Math.random;
        this.PreRNGEventHandler = null;
        this.PostRNGEventHandler = null;
        this.AwaitingResponse = false;
        this.MaxCachedNumbers = 50;
        this.UpdatePoint = 0.5;
        this.HasAlerted = false;
        this.Enabled = true;
        this.LastRandomNumber = Math.random();
        this.QuickToggleButton = null;
    }
    UpdateAPIKey(key) {
        this.RandomGenerator = new RandomAPI(key);
        this.UpdateRandomNumbers();
    }
    GenerateQuickToggleButton(enabled) {
        if (!game.user || !game.user.isGM || this.QuickToggleButton)
            return;
        const style = document.createElement("style");
        style.innerHTML = `
            .trhidden { display: none; }
            .trvisible { display: initial; }
            .trquickbutton {
                flex: inherit;
                margin: auto auto;
                text-align: center;
                padding-right: 4px;
            }`;
        document.body.appendChild(style);
        const quickToggleButton = document.createElement("a");
        const outerDiv = document.querySelector("#chat-controls");
        const firstChild = outerDiv?.firstElementChild;
        quickToggleButton.id = "TrueRandomQuickToggleButton";
        quickToggleButton.title = "Toggle the TrueRandom module";
        quickToggleButton.classList.add("trquickbutton", enabled ? "trvisible" : "trhidden");
        quickToggleButton.innerHTML = game.settings.get("truerandom", "ENABLED") ? "RndON" : "RndOFF";
        quickToggleButton.addEventListener("click", () => {
            const isEnabled = game.settings.get("truerandom", "ENABLED");
            game.settings.set("truerandom", "ENABLED", !isEnabled);
            quickToggleButton.innerHTML = isEnabled ? "RndOFF" : "RndON";
        });
        if (outerDiv) {
            outerDiv.insertBefore(quickToggleButton, firstChild);
        }
        this.QuickToggleButton = quickToggleButton;
    }
    UpdateRandomNumbers() {
        if (!this.Enabled || this.AwaitingResponse)
            return;
        this.AwaitingResponse = true;
        this.RandomGenerator.GenerateDecimals({ decimalPlaces: 5, n: this.MaxCachedNumbers })
            .then((response) => {
            this.RandomNumbers = this.RandomNumbers.concat(response.data);
            // Show seeds in chat if enabled
            if (game.settings.get("truerandom", "SHOWSEEDS")) {
                const seedList = response.data.join(", ");
                const message = `<div style="border: 1px solid #444; padding: 8px; margin: 4px 0; background: rgba(0,0,0,0.1);">
                        <strong>🎲 TrueRandom Seeds Fetched:</strong><br>
                        <small style="font-family: monospace;">${seedList}</small><br>
                        <em style="color: #888; font-size: 11px;">Retrieved ${response.data.length} true random seeds from random.org</em>
                    </div>`;
                ChatMessage.create({
                    content: message,
                    whisper: game.users.filter(u => u.isGM).map(u => u.id),
                    speaker: { alias: "TrueRandom System" }
                });
            }
        })
            .catch((reason) => Debug.WriteLine(`Random.org error: ${reason}`))
            .finally(() => this.AwaitingResponse = false);
    }
    GetRandomNumber() {
        if (!this.Enabled) return this.OriginalRandomFunction();
        if (!this.RandomGenerator?.ApiKey) {
            if (!this.HasAlerted) {
                this.HasAlerted = true;
                new Dialog({
                    title: "WARNING MISSING API KEY",
                    content: "You must set an API key in Module Settings for TrueRandom to function.",
                    buttons: { ok: { label: "Ok" } },
                    default: "ok"
                }).render(true);
            }
            return this.OriginalRandomFunction();
        }
        if (!this.RandomNumbers.length) {
            this.UpdateRandomNumbers();
            return this.OriginalRandomFunction();
        }
        let rngFuncReference = new Ref(this.PopRandomNumber.bind(this));
        if (this.PreRNGEventHandler && this.PreRNGEventHandler(this, rngFuncReference)) {
            rngFuncReference.Reference = this.OriginalRandomFunction;
        }
        if ((this.RandomNumbers.length / this.MaxCachedNumbers) < this.UpdatePoint) {
            this.UpdateRandomNumbers();
        }
        let randomNumber = rngFuncReference.Reference();
        let randomNumberRef = new Ref(randomNumber);
        if (this.PostRNGEventHandler) {
            this.PostRNGEventHandler(this, randomNumberRef);
        }
        this.LastRandomNumber = randomNumberRef.Reference;
        return this.LastRandomNumber;
    }
    PopRandomNumber() {
        const ms = new Date().getTime();
        const index = ms % this.RandomNumbers.length;
        let rng = this.RandomNumbers[index];
        if (rng <= Number.EPSILON)
            rng = Number.EPSILON;
        this.RandomNumbers.splice(index, 1);
        return rng;
    }
}
var trueRandom = new TrueRandom();
globalThis.TrueRandom = trueRandom;
Hooks.once('init', () => {
    trueRandom.OriginalRandomFunction = CONFIG.Dice.randomUniform ?? Math.random;
    CONFIG.Dice.randomUniform = trueRandom.GetRandomNumber.bind(trueRandom);
    game.settings.register("truerandom", "APIKEY", {
        name: "Random.org API Key",
        hint: "Put your developer key from https://api.random.org/dashboard here",
        scope: "world", config: true, type: String, default: "",
        onChange: value => trueRandom.UpdateAPIKey(value)
    });
    game.settings.register("truerandom", "MAXCACHEDNUMBERS", {
        name: "Max Cached Numbers",
        hint: "Number of random numbers to cache per client.",
        scope: "world", config: true, type: Number,
        range: { min: 5, max: 200, step: 1 },
        default: 10,
        onChange: value => trueRandom.MaxCachedNumbers = value
    });
    game.settings.register("truerandom", "UPDATEPOINT", {
        name: "Update Point",
        hint: "Percentage of cache to trigger refetch.",
        scope: "world", config: true, type: Number,
        range: { min: 1, max: 100, step: 1 },
        default: 50,
        onChange: value => trueRandom.UpdatePoint = value * 0.01
    });
    game.settings.register("truerandom", "DEBUG", {
        name: "Print Debug Messages",
        hint: "Print debug messages to console",
        scope: "client", config: true, type: Boolean,
        default: true,
        onChange: value => Debug.WriteLine(`Debug: ${value}`)
    });
    game.settings.register("truerandom", "ENABLED", {
        name: "Enabled",
        hint: "Enables/Disables the module",
        scope: "world", config: true, type: Boolean,
        default: true,
        onChange: value => trueRandom.Enabled = value
    });
    game.settings.register("truerandom", "QUICKTOGGLE", {
        name: "Show Quick Toggle Button",
        hint: "Toggle ON/OFF above chat",
        scope: "client", config: true, type: Boolean,
        default: true,
        onChange: value => {
            if (value) {
                trueRandom.QuickToggleButton?.classList.remove("trhidden");
                trueRandom.QuickToggleButton?.classList.add("trvisible");
            }
            else {
                trueRandom.QuickToggleButton?.classList.add("trhidden");
                trueRandom.QuickToggleButton?.classList.remove("trvisible");
            }
        }
    });
    game.settings.register("truerandom", "SHOWSEEDS", {
        name: "Show Seeds in Chat",
        hint: "Display fetched random seeds in chat when retrieved from random.org",
        scope: "world", config: true, type: Boolean,
        default: false
    });
    trueRandom.MaxCachedNumbers = parseInt(game.settings.get("truerandom", "MAXCACHEDNUMBERS"));
    trueRandom.UpdatePoint = game.settings.get("truerandom", "UPDATEPOINT") * 0.01;
    const currentKey = game.settings.get("truerandom", "APIKEY");
    if (currentKey?.length) {
        LocalStorage.Set("TrueRandom.ApiKey", currentKey);
        trueRandom.UpdateAPIKey(currentKey);
    }
    else if (LocalStorage.Get("TrueRandom.ApiKey", null)) {
        const savedKey = LocalStorage.Get("TrueRandom.ApiKey");
        game.settings.set("truerandom", "APIKEY", savedKey);
        trueRandom.UpdateAPIKey(savedKey);
    }
    trueRandom.Enabled = game.settings.get("truerandom", "ENABLED");
});
Hooks.once("renderChatLog", () => {
    let enabled = true;
    try {
        enabled = game.settings.get("truerandom", "QUICKTOGGLE");
    }
    catch (e) { }
    trueRandom.GenerateQuickToggleButton(enabled);
});
