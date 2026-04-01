/**
 * @aporto/sdk — Error types
 */

export class AportoError extends Error {
    readonly status: number;
    constructor(message: string, status: number) {
        super(message);
        this.name = "AportoError";
        this.status = status;
    }
}

export class AportoConfigError extends AportoError {
    constructor(message: string) {
        super(message, 0);
        this.name = "AportoConfigError";
    }
}

export class AportoNotAvailableError extends AportoError {
    constructor(module: string) {
        super(
            `${module} is not available in @aporto/sdk v0.1 — it will be enabled in v0.2 once the backend route is confirmed live on api.aporto.tech`,
            501
        );
        this.name = "AportoNotAvailableError";
    }
}
