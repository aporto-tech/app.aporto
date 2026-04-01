import { AportoNotAvailableError } from "../errors";

export function createDbModule() {
    return {
        query: (): never => { throw new AportoNotAvailableError("db"); },
    };
}
