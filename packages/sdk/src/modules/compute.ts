import { AportoNotAvailableError } from "../errors";

export function createComputeModule() {
    return {
        run: (): never => { throw new AportoNotAvailableError("compute"); },
    };
}
