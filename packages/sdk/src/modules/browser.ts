import { AportoNotAvailableError } from "../errors";

export function createBrowserModule() {
    return {
        scrape: (): never => { throw new AportoNotAvailableError("browser"); },
        screenshot: (): never => { throw new AportoNotAvailableError("browser"); },
    };
}
