"use client";

import React, { useState, useEffect, useCallback } from "react";
import styles from "./addServiceModal.module.css";

type ConnectionMethod = "sdk" | "baseurl";
type Step = 1 | 2 | 3 | 4 | 5;

interface Props {
    apiKey: string;
    onClose: () => void;
    provider?: { baseUrl?: string; path?: string; [key: string]: unknown };
}

const STEP_LABELS = ["Intro", "Install SDK", "Test", "Create Rule", "Success"];

export default function AddServiceModal({ apiKey, onClose, provider }: Props) {
    const [step, setStep] = useState<Step>(1);
    const [method, setMethod] = useState<ConnectionMethod>("sdk");
    const [copied, setCopied] = useState<"key" | "code" | "url" | null>(null);

    // Step 3: poll for activity
    const [activityDetected, setActivityDetected] = useState(false);
    const [polling, setPolling] = useState(false);
    const [lastLogCount, setLastLogCount] = useState<number | null>(null);

    // Step 4: spending rule
    const [ruleAmount, setRuleAmount] = useState("1");
    const [rulePeriod, setRulePeriod] = useState("Per Day");
    const [isCreatingRule, setIsCreatingRule] = useState(false);
    const [ruleError, setRuleError] = useState("");
    const [ruleCreated, setRuleCreated] = useState(false);

    const displayKey = apiKey || "sk-CREATE_API_KEY_FIRST";
    const baseUrl = (provider as any)?.baseUrl ?? "https://api.aporto.tech/v1";

    // ── Polling for Step 3 ─────────────────────────────────────────────────
    useEffect(() => {
        if (step !== 3) return;

        // Capture baseline log count
        if (lastLogCount === null) {
            fetch("/api/newapi/logs?page=0&size=1")
                .then(r => r.json())
                .then(d => setLastLogCount(d.total ?? 0))
                .catch(() => setLastLogCount(0));
        }

        setPolling(true);
        const interval = setInterval(async () => {
            try {
                const res = await fetch("/api/newapi/logs?page=0&size=1", { cache: "no-store" });
                const data = await res.json();
                if (data.success && (data.total ?? 0) > (lastLogCount ?? 0)) {
                    setActivityDetected(true);
                    clearInterval(interval);
                }
            } catch { /* ignore */ }
        }, 3000);

        return () => { clearInterval(interval); setPolling(false); };
    }, [step, lastLogCount]);

    // ── Copy helper ───────────────────────────────────────────────────────
    const copy = useCallback((text: string, type: "key" | "code" | "url") => {
        navigator.clipboard.writeText(text).catch(() => { });
        setCopied(type);
        setTimeout(() => setCopied(null), 2000);
    }, []);

    // ── Step 4: create spending rule ──────────────────────────────────────
    const handleCreateRule = useCallback(async () => {
        setIsCreatingRule(true);
        setRuleError("");
        try {
            // Get the first token
            const keysRes = await fetch("/api/newapi/keys");
            const keysData = await keysRes.json();
            if (!keysData.success || !keysData.tokens?.length) {
                setRuleError("Create an API key first.");
                return;
            }
            const token = keysData.tokens[0];
            const quota = Math.floor(Number(ruleAmount) * 500_000);
            const res = await fetch("/api/newapi/keys", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    tokenId: token.id,
                    name: token.name,
                    remain_quota: quota,
                    unlimited_quota: false,
                }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.message ?? "Failed");
            setRuleCreated(true);
            setStep(5);
        } catch (err) {
            setRuleError(String(err));
        } finally {
            setIsCreatingRule(false);
        }
    }, [ruleAmount]);

    // ── Code snippets ─────────────────────────────────────────────────────
    const sdkCode = `import { AportoClient } from "@aporto-tech/sdk";

const aporto = new AportoClient({
  apiKey: "${displayKey}",
});

const chat = await aporto.llm.chat.completions.create({
  model: "openai/gpt-4o-mini",
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(chat.choices[0].message.content);`;

    const baseUrlCode = `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "${displayKey}",
  baseURL: "${baseUrl}",
});

const chat = await client.chat.completions.create({
  model: "openai/gpt-4o-mini",
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(chat.choices[0].message.content);`;

    // ── Render ────────────────────────────────────────────────────────────
    return (
        <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className={styles.modal}>
                {/* Header */}
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <div className={styles.plusIcon}>+</div>
                        <span className={styles.headerTitle}>Add a Skill</span>
                    </div>
                    <div className={styles.headerCenter}>
                        <div className={styles.stepper}>
                            {STEP_LABELS.map((_, i) => (
                                <div
                                    key={i}
                                    className={`${styles.dot} ${i + 1 < step ? styles.dotDone : ""} ${i + 1 === step ? styles.dotActive : ""}`}
                                />
                            ))}
                        </div>
                        <span className={styles.stepLabel}>Step {step} of 5: {STEP_LABELS[step - 1]}</span>
                    </div>
                    <button className={styles.closeBtn} onClick={onClose}>✕</button>
                </div>

                {/* Body */}
                <div className={styles.body}>

                    {/* ── Step 1: Choose method ── */}
                    {step === 1 && (
                        <>
                            <h2 className={styles.title}>Connect to Aporto Skill Network</h2>
                            <p className={styles.subtitle}>Choose how your agent will call skills</p>
                            <div className={styles.methodCards}>
                                <button
                                    className={`${styles.methodCard} ${method === "sdk" ? styles.methodCardActive : ""}`}
                                    onClick={() => setMethod("sdk")}
                                >
                                    <div className={styles.methodIcon}>📦</div>
                                    <div className={styles.methodName}>SDK</div>
                                    <div className={styles.methodDesc}>Install <code>@aporto-tech/sdk</code> and call typed skills</div>
                                </button>
                                <button
                                    className={`${styles.methodCard} ${method === "baseurl" ? styles.methodCardActive : ""}`}
                                    onClick={() => setMethod("baseurl")}
                                >
                                    <div className={styles.methodIcon}>🔗</div>
                                    <div className={styles.methodName}>Base URL</div>
                                    <div className={styles.methodDesc}>Use any OpenAI-compatible client or agent framework</div>
                                </button>
                            </div>
                        </>
                    )}

                    {/* ── Step 2: Install / Configure ── */}
                    {step === 2 && (
                        <>
                            <h2 className={styles.title}>{method === "sdk" ? "Install the SDK" : "Connect via Base URL"}</h2>
                            <p className={styles.subtitle}>
                                {method === "sdk"
                                    ? "Use our SDK to send requests through Aporto. Your API key is pre-filled."
                                    : "Point any OpenAI-compatible client at our Base URL."}
                            </p>

                            {/* API Key box */}
                            <div className={styles.keyBox}>
                                <span className={styles.keyLabel}>Your API Key</span>
                                <button className={styles.copyBtn} onClick={() => copy(displayKey, "key")}>
                                    {copied === "key" ? "✓ Copied" : "⎘ Copy"}
                                </button>
                                <div className={styles.keyValue}>{displayKey}</div>
                            </div>

                            {/* Base URL box (only for baseurl method) */}
                            {method === "baseurl" && (
                                <div className={styles.keyBox} style={{ marginTop: 10 }}>
                                    <span className={styles.keyLabel}>Base URL</span>
                                    <button className={styles.copyBtn} onClick={() => copy(baseUrl, "url")}>
                                        {copied === "url" ? "✓ Copied" : "⎘ Copy"}
                                    </button>
                                    <div className={styles.keyValue}>{baseUrl}</div>
                                </div>
                            )}

                            {/* Code snippet */}
                            <div className={styles.codeBlock}>
                                <div className={styles.codeHeader}>
                                    <div className={styles.dots}>
                                        <span style={{ background: "#ff5f57" }} />
                                        <span style={{ background: "#febc2e" }} />
                                        <span style={{ background: "#28c840" }} />
                                    </div>
                                    <span className={styles.codeLang}>
                                        {method === "sdk" ? "@aporto-tech/sdk" : "openai (base url)"}
                                    </span>
                                    <button className={styles.copyBtn} onClick={() => copy(method === "sdk" ? sdkCode : baseUrlCode, "code")}>
                                        {copied === "code" ? "✓ Copied" : "⎘ Copy"}
                                    </button>
                                </div>
                                <pre className={styles.code}>
                                    {method === "sdk" ? (
                                        <>
                                            {method === "sdk" && (
                                                <span className={styles.comment}>{"// npm install @aporto-tech/sdk\n\n"}</span>
                                            )}
                                        </>
                                    ) : (
                                        <span className={styles.comment}>{"// npm install openai\n\n"}</span>
                                    )}
                                    <code>{method === "sdk" ? sdkCode : baseUrlCode}</code>
                                </pre>
                            </div>

                            {/* Base URL quick reference */}
                            {method === "baseurl" && (
                                <div className={styles.infoBox}>
                                    <strong>Works with:</strong> Cursor, GitHub Copilot, LangChain, LlamaIndex, any OpenAI SDK.
                                    Set <code>baseURL = https://api.aporto.tech/v1</code> and use your Aporto API key.
                                </div>
                            )}
                        </>
                    )}

                    {/* ── Step 3: Test ── */}
                    {step === 3 && (
                        <>
                            <h2 className={styles.title}>Waiting for Transaction</h2>
                            <p className={styles.subtitle}>Run your code to send a test request. We'll detect it automatically.</p>
                            <div className={styles.waitBox}>
                                {activityDetected ? (
                                    <>
                                        <div className={styles.successIcon}>✓</div>
                                        <div className={styles.waitText}>Activity detected!</div>
                                        <div className={styles.waitSub}>Request received by Aporto API</div>
                                    </>
                                ) : (
                                    <>
                                        <div className={styles.spinner} />
                                        <div className={styles.waitText}>Waiting for activity...</div>
                                        <div className={styles.waitSub}>Looking for requests to <code>api.aporto.tech</code></div>
                                    </>
                                )}
                            </div>
                        </>
                    )}

                    {/* ── Step 4: Create Rule ── */}
                    {step === 4 && (
                        <>
                            <h2 className={styles.title}>Create a Spending Rule</h2>
                            <p className={styles.subtitle}>Protect your spend by setting limits on this service.</p>
                            <div className={styles.ruleCard}>
                                <div className={styles.ruleIcon}>🛡</div>
                                <div>
                                    <div className={styles.ruleName}>Aporto Spend Limit</div>
                                    <div className={styles.ruleDesc}>Block requests when limit is exceeded</div>
                                </div>
                            </div>
                            <div className={styles.ruleFields}>
                                <div className={styles.ruleField}>
                                    <label>Limit Type</label>
                                    <select value="Spending" disabled className={styles.select}>
                                        <option>Spending</option>
                                    </select>
                                </div>
                                <div className={styles.ruleField}>
                                    <label>Amount ($)</label>
                                    <input
                                        type="number"
                                        min="0.01"
                                        step="0.01"
                                        value={ruleAmount}
                                        onChange={(e) => setRuleAmount(e.target.value)}
                                        className={styles.input}
                                    />
                                </div>
                                <div className={styles.ruleField}>
                                    <label>Time Period</label>
                                    <select
                                        value={rulePeriod}
                                        onChange={(e) => setRulePeriod(e.target.value)}
                                        className={styles.select}
                                    >
                                        <option>Per Day</option>
                                        <option>Per Week</option>
                                        <option>Per Month</option>
                                        <option>Per Run</option>
                                    </select>
                                </div>
                            </div>
                            {ruleError && <div className={styles.error}>{ruleError}</div>}
                        </>
                    )}

                    {/* ── Step 5: Success ── */}
                    {step === 5 && (
                        <>
                            <div className={styles.successBadge}>✓</div>
                            <h2 className={styles.title}>You're All Set!</h2>
                            <p className={styles.subtitle}>Aporto API is connected and ready to use.</p>
                            <div className={styles.summaryBox}>
                                <div className={styles.summaryTitle}>Setup Summary</div>
                                <div className={styles.summaryItem}>✓ API key configured</div>
                                {method === "sdk" && <div className={styles.summaryItem}>✓ SDK installed</div>}
                                {method === "baseurl" && <div className={styles.summaryItem}>✓ Base URL configured</div>}
                                {ruleCreated && <div className={styles.summaryItem}>✓ Spending rule created</div>}
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className={styles.footer}>
                    {step > 1 && step < 5 && (
                        <button className={styles.backBtn} onClick={() => setStep((s) => (s - 1) as Step)}>
                            ← Back
                        </button>
                    )}

                    {step === 1 && (
                        <button className={styles.primaryBtn} onClick={() => setStep(2)}>
                            Continue →
                        </button>
                    )}

                    {step === 2 && (
                        <button className={styles.primaryBtn} onClick={() => setStep(3)}>
                            I've Added the Code →
                        </button>
                    )}

                    {step === 3 && (
                        <>
                            <button className={styles.skipBtn} onClick={() => setStep(4)}>Skip for Now</button>
                            <button
                                className={styles.primaryBtn}
                                onClick={() => setStep(4)}
                                disabled={!activityDetected}
                                style={{ opacity: activityDetected ? 1 : 0.5 }}
                            >
                                Continue →
                            </button>
                        </>
                    )}

                    {step === 4 && (
                        <>
                            <button className={styles.skipBtn} onClick={() => setStep(5)}>Skip for Now</button>
                            <button
                                className={styles.primaryBtn}
                                onClick={handleCreateRule}
                                disabled={isCreatingRule}
                            >
                                {isCreatingRule ? "Saving..." : "Create Rule →"}
                            </button>
                        </>
                    )}

                    {step === 5 && (
                        <>
                            <button className={styles.backBtn} onClick={onClose}>Done</button>
                            <button className={styles.primaryBtn} onClick={onClose}>Go to Dashboard →</button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
