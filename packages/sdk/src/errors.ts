/**
 * @aporto-tech/sdk - Error types
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
            `${module} is not available in @aporto-tech/sdk yet because the backend route is not live on app.aporto.tech`,
            501
        );
        this.name = "AportoNotAvailableError";
    }
}
