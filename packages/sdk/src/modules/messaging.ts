import { AportoNotAvailableError } from "../errors";

export function createMessagingModule() {
    return {
        send: (): never => { throw new AportoNotAvailableError("messaging"); },
    };
}
