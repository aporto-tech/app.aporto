// src/modules/llm.ts
import OpenAI from "openai";
function createLlmModule(apiKey, agentName) {
  const defaultHeaders = {};
  if (agentName) {
    defaultHeaders["X-Agent-Name"] = agentName;
  }
  return new OpenAI({
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
  constructor(module) {
    super(
      `${module} is not available in @aporto/sdk v0.1 \u2014 it will be enabled in v0.2 once the backend route is confirmed live on api.aporto.tech`,
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
export {
  AportoClient,
  AportoConfigError,
  AportoError,
  AportoNotAvailableError
};
//# sourceMappingURL=index.mjs.map