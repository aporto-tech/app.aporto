import { AportoNotAvailableError } from "../errors";

export function createImagesModule() {
    return {
        generate: (): never => { throw new AportoNotAvailableError("images"); },
        edit: (): never => { throw new AportoNotAvailableError("images"); },
    };
}
