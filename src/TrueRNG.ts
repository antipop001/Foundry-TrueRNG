import { Debug } from "./Debug.js";
import { RandomAPI } from "./RandomAPI.js";
import { JsonRPCRequest } from './JsonRPC';
import { PreRNGEvent, PostRNGEvent, RNGFunction, Ref } from './Types.js';
import { LocalStorage } from './BrowserConfig.js';

declare var Hooks;
declare var game;
declare var CONFIG;

export class TrueRNG {
    public RandomNumbers: number[] = [];
    public RandomGenerator: RandomAPI | null = null;
    public AwaitingResponse: boolean;
    public MaxCachedNumbers: number;
    public UpdatePoint: number;
    public HasAlerted: boolean;
    public Enabled: boolean;
    public OriginalRandomFunction: RNGFunction = Math.random;
    public PreRNGEventHandler: PreRNGEvent | null = null;
    public PostRNGEventHandler: PostRNGEvent | null = null;
    public LastRandomNumber: number;
    public QuickToggleButton: HTMLAnchorElement | null;

    constructor() {
        this.AwaitingResponse = false;
        this.MaxCachedNumbers = 50;
        this.UpdatePoint = 0.5;
        this.HasAlerted = false;
        this.Enabled = true;
        this.LastRandomNumber = Math.random();
        this.QuickToggleButton = null;
    }

    public UpdateAPIKey(key: string): void {
        this.RandomGenerator = new RandomAPI(key);
        this.UpdateRandomNumbers();
    }

    public GenerateQuickToggleButton(enabled: boolean) {
        if (!game.user || !game.user.isGM || this.QuickToggleButton) return;

        const style = document.createElement("style");
        style.innerHTML = \`
            .trhidden { display: none; }
            .trvisible { display: initial; }
            .trquickbutton {
                flex: inherit;
                margin: auto auto;
                text-align: center;
                padding-right: 4px;
            }\`;
        document.body.appendChild(style);

        const quickToggleButton = document.createElement("a");
        const outerDiv = document.querySelector("#chat-controls");
        const firstChild = document.querySelector("#chat-controls > .chat-control-icon");

        quickToggleButton.id = "TrueRNGQuickToggleButton";
        quickToggleButton.title = "Toggle the TrueRNG module";
        quickToggleButton.classList.add("trquickbutton", enabled ? "trvisible" : "trhidden");
        quickToggleButton.innerHTML = game.settings.get("truerng", "ENABLED") ? "ON" : "OFF";

        quickToggleButton.addEventListener("click", () => {
            const isEnabled = game.settings.get("truerng", "ENABLED");
            game.settings.set("truerng", "ENABLED", !isEnabled);
            quickToggleButton.innerHTML = isEnabled ? "OFF" : "ON";
        });

        outerDiv?.insertBefore(quickToggleButton, firstChild);
        this.QuickToggleButton = quickToggleButton;
    }

    public UpdateRandomNumbers(): void {
        if (!this.Enabled || this.AwaitingResponse) return;

        this.AwaitingResponse = true;
        this.RandomGenerator!.GenerateDecimals({ decimalPlaces: 5, n: this.MaxCachedNumbers })
            .then((response) => {
                this.RandomNumbers = this.RandomNumbers.concat(response.data);
            })
            .catch((reason) => Debug.WriteLine(`Random.org error: ${reason}`))
            .finally(() => this.AwaitingResponse = false);
    }

    public GetRandomNumber(): number {
        if (!this.Enabled || !this.RandomGenerator?.ApiKey) {
            if (!this.HasAlerted) {
                this.HasAlerted = true;
                new Dialog({
                    title: "WARNING MISSING API KEY",
                    content: "You must set an API key in Module Settings for TrueRNG to function.",
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

        let rngFuncReference = new Ref<RNGFunction>(this.PopRandomNumber.bind(this));
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

    public PopRandomNumber(): number {
        const ms = new Date().getTime();
        const index = ms % this.RandomNumbers.length;
        let rng = this.RandomNumbers[index];
        if (rng <= Number.EPSILON) rng = Number.EPSILON;
        this.RandomNumbers.splice(index, 1);
        return rng;
    }
}

var trueRNG = new TrueRNG();
globalThis.TrueRNG = trueRNG;

Hooks.once('init', () => {
    trueRNG.OriginalRandomFunction = CONFIG.Dice.randomUniform ?? Math.random;
    CONFIG.Dice.randomUniform = trueRNG.GetRandomNumber.bind(trueRNG);

    game.settings.register("truerng", "APIKEY", {
        name: "Random.org API Key",
        hint: "Put your developer key from https://api.random.org/dashboard here",
        scope: "world", config: true, type: String, default: "",
        onChange: value => trueRNG.UpdateAPIKey(value)
    });

    game.settings.register("truerng", "MAXCACHEDNUMBERS", {
        name: "Max Cached Numbers",
        hint: "Number of random numbers to cache per client.",
        scope: "world", config: true, type: Number,
        range: { min: 5, max: 200, step: 1 },
        default: 10,
        onChange: value => trueRNG.MaxCachedNumbers = value
    });

    game.settings.register("truerng", "UPDATEPOINT", {
        name: "Update Point",
        hint: "Percentage of cache to trigger refetch.",
        scope: "world", config: true, type: Number,
        range: { min: 1, max: 100, step: 1 },
        default: 50,
        onChange: value => trueRNG.UpdatePoint = value * 0.01
    });

    game.settings.register("truerng", "DEBUG", {
        name: "Print Debug Messages",
        hint: "Print debug messages to console",
        scope: "client", config: true, type: Boolean,
        default: true,
        onChange: value => Debug.WriteLine(`Debug: ${value}`)
    });

    game.settings.register("truerng", "ENABLED", {
        name: "Enabled",
        hint: "Enables/Disables the module",
        scope: "world", config: true, type: Boolean,
        default: true,
        onChange: value => trueRNG.Enabled = value
    });

    game.settings.register("truerng", "QUICKTOGGLE", {
        name: "Show Quick Toggle Button",
        hint: "Toggle ON/OFF above chat",
        scope: "client", config: true, type: Boolean,
        default: true,
        onChange: value => {
            if (value) {
                trueRNG.QuickToggleButton?.classList.remove("trhidden");
                trueRNG.QuickToggleButton?.classList.add("trvisible");
            } else {
                trueRNG.QuickToggleButton?.classList.add("trhidden");
                trueRNG.QuickToggleButton?.classList.remove("trvisible");
            }
        }
    });

    trueRNG.MaxCachedNumbers = parseInt(game.settings.get("truerng", "MAXCACHEDNUMBERS"));
    trueRNG.UpdatePoint = game.settings.get("truerng", "UPDATEPOINT") * 0.01;

    const currentKey = game.settings.get("truerng", "APIKEY");
    if (currentKey?.length) {
        LocalStorage.Set("TrueRNG.ApiKey", currentKey);
        trueRNG.UpdateAPIKey(currentKey);
    } else if (LocalStorage.Get("TrueRNG.ApiKey", null)) {
        const savedKey = LocalStorage.Get<string>("TrueRNG.ApiKey");
        game.settings.set("truerng", "APIKEY", savedKey);
        trueRNG.UpdateAPIKey(savedKey);
    }

    trueRNG.Enabled = game.settings.get("truerng", "ENABLED");
});

Hooks.once("renderChatLog", () => {
    let enabled = true;
    try {
        enabled = game.settings.get("truerng", "QUICKTOGGLE");
    } catch (e) {}
    trueRNG.GenerateQuickToggleButton(enabled);
});