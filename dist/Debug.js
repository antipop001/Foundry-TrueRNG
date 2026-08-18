export class Debug {
    static get Enabled() {
        try {
            return game.settings.get("truerandom", "DEBUG");
        }
        catch {
            return true;
        }
    }
    static WriteLine(message, ...params) {
        if (Debug.Enabled) {
            if (params.length) {
                console.log("TrueRandom | " + message, params);
            }
            else {
                console.log("TrueRandom | " + message);
            }
        }
    }
    static Group(message) {
        if (Debug.Enabled) {
            console.group(message);
        }
    }
    static GroupCollapsed(message) {
        if (Debug.Enabled) {
            console.groupCollapsed(message);
        }
    }
    static GroupEnd() {
        if (Debug.Enabled) {
            console.groupEnd();
        }
    }
    static Assert(value, ...params) {
        if (Debug.Enabled) {
            if (params.length) {
                console.assert(value, params);
            }
            else {
                console.log(value);
            }
        }
    }
}
