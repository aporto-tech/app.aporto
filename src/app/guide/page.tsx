"use client";

import React, { useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import styles from "./guide.module.css";

type IntegrationMode = "cli" | "mcp" | "sdk";

const CLI_STEPS = [
    {
        title: "Install the CLI",
        code: `npm install -g @aporto-tech/sdk`,
    },
    {
        title: "Set your API key",
        code: `export APORTO_API_KEY=sk-live-YOUR_KEY`,
    },
    {
        title: "Discover skills",
        code: `aporto discover "generate image"

# Output:
# 4    Image Generation         media/image    $0.0040/call
# 96   Image Generation Nano Banana 2 1K  media/image  $0.0400/call
# 67   Image Generation Recraft media/image    $0.0200/call`,
    },
    {
        title: "Run a skill",
        code: `aporto run 4 --param prompt="a cat on the moon" --wait

# Output:
# status: succeeded
# runId: abc123...
# skill: Image Generation
# provider: fal-flux-schnell
# costUSD: 0.004
# artifact: https://storage.aporto.tech/...`,
    },
];

const MCP_CONFIG = `// Add to your MCP client config (Claude, Cursor, Windsurf, etc.)
{
  "mcpServers": {
    "aporto": {
      "url": "https://app.aporto.tech/api/mcp",
      "headers": {
        "Authorization": "Bearer sk-live-YOUR_KEY"
      }
    }
  }
}

// Available MCP tools:
// - aporto_discover_skills — find skills by description
// - aporto_run_skill — execute with smart routing
// - aporto_get_skill_run — poll async results
// - aporto_chat — LLM completions
// - aporto_image_generate — image generation
// - aporto_tts_create — text to speech
// - aporto_search — web search`;

const SDK_CODE = `import { AportoClient } from "@aporto-tech/sdk";

const aporto = new AportoClient({
  apiKey: process.env.APORTO_API_KEY,
});

// Discover skills
const { skills } = await aporto.routing.discoverSkills({
  query: "generate image",
});

// Run a skill
const result = await aporto.routing.runSkill({
  intent: "generate product image",
  params: { prompt: "a cat on the moon" },
  waitForResult: true,
});

console.log(result.artifacts?.[0]?.url);`;

export default function GuidePage() {
    const [mode, setMode] = useState<IntegrationMode>("cli");

    const copyCode = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    return (
        <DashboardLayout>
            <div className={styles.container}>
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <div className={styles.mainIcon}>▶</div>
                        <div className={styles.headerText}>
                            <h1>Getting Started</h1>
                            <p>Start using Aporto in under a minute</p>
                        </div>
                    </div>
                    <a
                        href="https://docs.aporto.tech"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.docsBtn}
                        style={{ textDecoration: "none" }}
                    >
                        📄 Full Docs ⧉
                    </a>
                </div>

                <div className={styles.modeTabs}>
                    <button
                        className={`${styles.modeTab} ${mode === "cli" ? styles.modeActive : ""}`}
                        onClick={() => setMode("cli")}
                    >
                        CLI
                    </button>
                    <button
                        className={`${styles.modeTab} ${mode === "mcp" ? styles.modeActive : ""}`}
                        onClick={() => setMode("mcp")}
                    >
                        MCP Server
                    </button>
                    <button
                        className={`${styles.modeTab} ${mode === "sdk" ? styles.modeActive : ""}`}
                        onClick={() => setMode("sdk")}
                    >
                        TypeScript SDK
                    </button>
                </div>

                <div className={styles.stepContent}>
                    {mode === "cli" && (
                        <div className={styles.cliSteps}>
                            {CLI_STEPS.map((step, i) => (
                                <div key={step.title} className={styles.cliStep}>
                                    <div className={styles.stepNumber}>{i + 1}</div>
                                    <div className={styles.stepBody}>
                                        <h3>{step.title}</h3>
                                        <div className={styles.codeBox}>
                                            <div className={styles.codeHeader}>
                                                <span>Terminal</span>
                                                <button className={styles.copyBtn} onClick={() => copyCode(step.code)}>
                                                    Copy
                                                </button>
                                            </div>
                                            <pre className={styles.codeContent}>{step.code}</pre>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <div className={styles.doneCard}>
                                <strong>Done!</strong> You can now discover and run any of 1000+ skills from your terminal.
                                Use <code>aporto discover</code> to search and <code>aporto run</code> to execute.
                            </div>
                        </div>
                    )}

                    {mode === "mcp" && (
                        <div className={styles.cliSteps}>
                            <div className={styles.cliStep}>
                                <div className={styles.stepNumber}>1</div>
                                <div className={styles.stepBody}>
                                    <h3>Add Aporto MCP server to your AI client</h3>
                                    <p className={styles.stepDesc}>
                                        Works with Claude Code, Cursor, Windsurf, Cline, and any MCP-compatible client.
                                    </p>
                                    <div className={styles.codeBox}>
                                        <div className={styles.codeHeader}>
                                            <span>mcp-config.json</span>
                                            <button className={styles.copyBtn} onClick={() => copyCode(MCP_CONFIG)}>
                                                Copy
                                            </button>
                                        </div>
                                        <pre className={styles.codeContent}>{MCP_CONFIG}</pre>
                                    </div>
                                </div>
                            </div>
                            <div className={styles.doneCard}>
                                <strong>Done!</strong> Your AI agent now has access to all Aporto skills via MCP tools.
                                Ask it to discover and run skills naturally.
                            </div>
                        </div>
                    )}

                    {mode === "sdk" && (
                        <div className={styles.cliSteps}>
                            <div className={styles.cliStep}>
                                <div className={styles.stepNumber}>1</div>
                                <div className={styles.stepBody}>
                                    <h3>Install the SDK</h3>
                                    <div className={styles.codeBox}>
                                        <div className={styles.codeHeader}>
                                            <span>Terminal</span>
                                            <button className={styles.copyBtn} onClick={() => copyCode("npm install @aporto-tech/sdk")}>
                                                Copy
                                            </button>
                                        </div>
                                        <pre className={styles.codeContent}>npm install @aporto-tech/sdk</pre>
                                    </div>
                                </div>
                            </div>
                            <div className={styles.cliStep}>
                                <div className={styles.stepNumber}>2</div>
                                <div className={styles.stepBody}>
                                    <h3>Use in your code</h3>
                                    <div className={styles.codeBox}>
                                        <div className={styles.codeHeader}>
                                            <span>index.ts</span>
                                            <button className={styles.copyBtn} onClick={() => copyCode(SDK_CODE)}>
                                                Copy
                                            </button>
                                        </div>
                                        <pre className={styles.codeContent}>{SDK_CODE}</pre>
                                    </div>
                                </div>
                            </div>
                            <div className={styles.doneCard}>
                                <strong>Done!</strong> The SDK provides typed methods for all Aporto capabilities including
                                skill routing, LLM chat, image generation, TTS, search, and more.
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}
