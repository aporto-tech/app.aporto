import { AportoNotAvailableError } from "../errors";

export function createSmsModule() {
    return {
        send: (): never => { throw new AportoNotAvailableError("sms"); },
    };
}
