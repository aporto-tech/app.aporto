import { AportoNotAvailableError } from "../errors";

export function createAudioModule() {
    return {
        speech: (): never => { throw new AportoNotAvailableError("audio"); },
        transcribe: (): never => { throw new AportoNotAvailableError("audio"); },
    };
}
