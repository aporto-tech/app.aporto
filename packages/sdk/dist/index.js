"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  AportoClient: () => AportoClient,
  AportoConfigError: () => AportoConfigError,
  AportoError: () => AportoError,
  AportoNotAvailableError: () => AportoNotAvailableError
});
module.exports = __toCommonJS(index_exports);

// src/modules/llm.ts
var import_openai = __toESM(require("openai"));
function createLlmModule(apiKey, agentName) {
  const defaultHeaders = {};
  if (agentName) {
    defaultHeaders["X-Agent-Name"] = agentName;
  }
  return new import_openai.default({
    apiKey,
    baseURL: "https://api.aporto.tech/v1",
    defaultHeaders
  });
}

// src/errors.ts
var AportoError = class extends Error {
  constructor(message, status) {
    super(message);
    this.name = "AportoError";
    this.status = status;
  }
};
var AportoConfigError = class extends AportoError {
  constructor(message) {
    super(message, 0);
    this.name = "AportoConfigError";
  }
};
var AportoNotAvailableError = class extends AportoError {
  constructor(module2) {
    super(
      `${module2} is not available in @aporto/sdk v0.1 \u2014 it will be enabled in v0.2 once the backend route is confirmed live on api.aporto.tech`,
      501
    );
    this.name = "AportoNotAvailableError";
  }
};

// src/modules/search.ts
function createSearchModule(apiKey, agentName) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
  if (agentName) headers["X-Agent-Name"] = agentName;
  async function apiFetch(path, body) {
    const res = await fetch(`https://app.aporto.tech${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new AportoError(
        `Search request failed: ${res.status} ${res.statusText}${text ? ` \u2014 ${text}` : ""}`,
        res.status
      );
    }
    return res.json();
  }
  return {
    linkup(opts) {
      return apiFetch("/api/services/search", {
        query: opts.query,
        depth: opts.depth ?? "standard"
      });
    },
    you(opts) {
      return apiFetch("/api/services/ai-search", {
        query: opts.query,
        type: opts.type ?? "search"
      });
    }
  };
}

// src/modules/audio.ts
function createAudioModule(apiKey, agentName) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
  if (agentName) headers["X-Agent-Name"] = agentName;
  return {
    /** Returns raw audio bytes (mp3 by default) */
    async speech(opts) {
      const res = await fetch("https://app.aporto.tech/api/services/tts", {
        method: "POST",
        headers,
        body: JSON.stringify({
          text: opts.text,
          voice_id: opts.voice_id ?? "21m00Tcm4TlvDq8ikWAM",
          model_id: opts.model_id ?? "eleven_v3",
          output_format: opts.output_format ?? "mp3_44100_128"
        })
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new AportoError(`TTS request failed: ${res.status} ${res.statusText}${text ? ` \u2014 ${text}` : ""}`, res.status);
      }
      return res.arrayBuffer();
    }
  };
}

// src/modules/images.ts
function createImagesModule(apiKey, agentName) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
  if (agentName) headers["X-Agent-Name"] = agentName;
  return {
    async generate(opts) {
      const res = await fetch("https://app.aporto.tech/api/services/image", {
        method: "POST",
        headers,
        body: JSON.stringify({
          prompt: opts.prompt,
          model: opts.model ?? "flux-schnell",
          image_size: opts.image_size ?? "square_hd",
          num_images: opts.num_images ?? 1
        })
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new AportoError(`Image generation failed: ${res.status} ${res.statusText}${text ? ` \u2014 ${text}` : ""}`, res.status);
      }
      return res.json();
    }
  };
}

// src/modules/sms.ts
function createSmsModule(apiKey, agentName) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
  if (agentName) headers["X-Agent-Name"] = agentName;
  return {
    async send(opts) {
      const res = await fetch("https://app.aporto.tech/api/services/sms", {
        method: "POST",
        headers,
        body: JSON.stringify({ to: opts.to })
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new AportoError(`SMS send failed: ${res.status} ${res.statusText}${text ? ` \u2014 ${text}` : ""}`, res.status);
      }
      return res.json();
    },
    async check(opts) {
      const res = await fetch("https://app.aporto.tech/api/services/sms/check", {
        method: "POST",
        headers,
        body: JSON.stringify({ to: opts.to, code: opts.code })
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new AportoError(`SMS check failed: ${res.status} ${res.statusText}${text ? ` \u2014 ${text}` : ""}`, res.status);
      }
      return res.json();
    }
  };
}

// src/index.ts
var AportoClient = class {
  constructor(options) {
    if (!options.apiKey) {
      throw new AportoConfigError("apiKey is required");
    }
    const { apiKey, agentName } = options;
    this.llm = createLlmModule(apiKey, agentName);
    this.search = createSearchModule(apiKey, agentName);
    this.audio = createAudioModule(apiKey, agentName);
    this.images = createImagesModule(apiKey, agentName);
    this.sms = createSmsModule(apiKey, agentName);
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AportoClient,
  AportoConfigError,
  AportoError,
  AportoNotAvailableError
});
//# sourceMappingURL=index.js.map