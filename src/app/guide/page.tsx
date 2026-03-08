"use client";

import React, { useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import styles from "./guide.module.css";

const MOCK_API_KEY = "sk_live_iwQtcLiMnBMpZgFhXkMh3ig1042Pi7xwjGpdgfH0diJ";

const SERVICES = [
    { id: "prelude", title: "Prelude", desc: "Phone verification", icon: "💬", color: "light" },
    { id: "openrouter", title: "OpenRouter", desc: "Unified LLM access", icon: "🤖", color: "light" },
    { id: "linkup", title: "Linkup", desc: "AI web search", icon: "🔍", color: "light" },
    { id: "youcom", title: "You.com", desc: "Real-time AI search", icon: "🔍", color: "light" },
];

export default function GuidePage() {
    const [currentStep, setCurrentStep] = useState(1);
    const [selectedService, setSelectedService] = useState<string | null>(null);
    const [agentName, setAgentName] = useState("my-agent");
    const [codeFormat, setCodeFormat] = useState<"Axios" | "Fetch">("Axios");

    const handleNext = () => {
        if (currentStep < 5) setCurrentStep(currentStep + 1);
    };

    const handleBack = () => {
        if (currentStep > 1) setCurrentStep(currentStep - 1);
    };

    const copyCode = (text: string) => {
        navigator.clipboard.writeText(text);
        alert("Copied!");
    };

    const renderStepNav = () => {
        const steps = [
            { id: 1, label: "Select Service" },
            { id: 2, label: selectedService === "take_control" ? "Add Your Code" : "Run Example" },
            { id: 3, label: selectedService === "take_control" ? "Test Transaction" : "Results" },
            { id: 4, label: "Add Protection" },
            { id: 5, label: "Complete" }
        ];

        return (
            <div className={styles.wizardNav}>
                {steps.map((s, index) => {
                    let navClass = styles.navStep;
                    if (currentStep === s.id) navClass += ` ${styles.active}`;
                    if (currentStep > s.id) navClass += ` ${styles.completed}`;

                    return (
                        <React.Fragment key={s.id}>
                            <div className={navClass}>
                                <div className={styles.stepCircle}>
                                    {currentStep > s.id ? "✓" : s.id}
                                </div>
                                {s.label}
                            </div>
                            {index < steps.length - 1 && <div className={styles.navSeparator}>›</div>}
                        </React.Fragment>
                    );
                })}
            </div>
        );
    };

    const renderCodeBlock = () => {
        let codeContent = "";
        if (codeFormat === "Axios") {
            codeContent = `// npm install @sapiom/axios axios

import { withSapiom } from '@sapiom/axios';
import axios from 'axios';

// IMPORTANT: Store API keys securely as environment variables
// e.g., process.env.SAPIOM_API_KEY, process.env.OPENAI_API_KEY

const sapiomClient = withSapiom(axios, {
  apiKey: process.env.SAPIOM_API_KEY,  // Your Sapiom API Key
  agentName: '${agentName}'  // Your agent name
});

// Use like regular axios - requests are tracked automatically
const response = await sapiomClient.post('/v1/chat/completions', {
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello' }]
});`;
        } else {
            codeContent = `// Using standard fetch with Sapiom routing

const response = await fetch('https://api.aporto.tech/v1/chat/completions', {
    method: 'POST',
    headers: {
        'Authorization': \`Bearer \${process.env.SAPIOM_API_KEY}\`,
        'Content-Type': 'application/json',
        'X-Agent-Name': '${agentName}'
    },
    body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: 'Hello' }]
    })
});

const data = await response.json();`;
        }

        const lines = codeContent.split('\n');

        return (
            <div className={styles.codeBox}>
                <div className={styles.codeHeader}>
                    <div className={styles.windowControls}>
                        <div className={`${styles.dot} ${styles.red}`}></div>
                        <div className={`${styles.dot} ${styles.yellow}`}></div>
                        <div className={`${styles.dot} ${styles.green}`}></div>
                        <span className={styles.filename}>agentName</span>
                    </div>
                    <div className={styles.codeTabs}>
                        <button className={`${styles.codeTab} ${codeFormat === "Axios" ? styles.active : ""}`} onClick={() => setCodeFormat("Axios")}>Axios</button>
                        <button className={`${styles.codeTab} ${codeFormat === "Fetch" ? styles.active : ""}`} onClick={() => setCodeFormat("Fetch")}>Fetch</button>
                        <button className={styles.codeTab}>REST</button>
                        <button className={styles.copyBtn} onClick={() => copyCode(codeContent)}>⧉ Copy</button>
                    </div>
                </div>
                <div className={styles.codeContent}>
                    {lines.map((line, i) => {
                        // Very naive highlighting for visual mockup
                        let highlighted = line
                            .replace(/(import|from|const|await|async|class|if|return)/g, '<span class="' + styles.syntaxKeyword + '">$1</span>')
                            .replace(/('.*?'|".*?"|`.*?`)/g, '<span class="' + styles.syntaxString + '">$1</span>')
                            .replace(/(\/\/.*)/g, '<span class="' + styles.syntaxComment + '">$1</span>');

                        return (
                            <div key={i} className={styles.codeLine}>
                                <div className={styles.lineNumber}>{i + 1}</div>
                                <div dangerouslySetInnerHTML={{ __html: highlighted || ' ' }} />
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <DashboardLayout>
            <div className={styles.container}>
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <div className={styles.mainIcon}>▶</div>
                        <div className={styles.headerText}>
                            <h1>Interactive Guide</h1>
                            <p>Experience Sapiom in action</p>
                        </div>
                    </div>
                    <button className={styles.docsBtn}>
                        📄 Docs ⧉
                    </button>
                </div>

                {renderStepNav()}

                <div className={styles.stepContent}>
                    {currentStep === 1 && (
                        <div>
                            <h2 className={styles.stepTitle}>Choose Your Path</h2>
                            <p className={styles.stepSubtitle}>Try one of our services, or connect your own to see governance in action.</p>

                            <div className={styles.sectionLabel}>
                                <div className={styles.sectionIcon}>⚡</div>
                                <div>
                                    <p>Sapiom Services</p>
                                    <span>Execute live demos with real API calls</span>
                                </div>
                            </div>

                            <div className={styles.servicesGrid}>
                                {SERVICES.map(s => (
                                    <div
                                        key={s.id}
                                        className={`${styles.serviceCard} ${selectedService === s.id ? styles.selected : ""}`}
                                        onClick={() => setSelectedService(s.id)}
                                    >
                                        <div className={`${styles.serviceCardIcon} ${styles[s.color]}`}>{s.icon}</div>
                                        <div className={styles.serviceCardInfo}>
                                            <h3>{s.title}</h3>
                                            <p>{s.desc}</p>
                                        </div>
                                        <div className={styles.radioCircle}>
                                            <div className={styles.radioInner}></div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className={styles.divider}>
                                <span className={styles.dividerText}>OR</span>
                            </div>

                            <div className={styles.sectionLabel}>
                                <div className={styles.sectionIcon} style={{ color: '#2dd4bf' }}>🔗</div>
                                <div>
                                    <p>Take Control</p>
                                    <span>Add visibility and limits to your AI spend</span>
                                </div>
                            </div>

                            <div
                                className={`${styles.serviceCard} ${selectedService === "take_control" ? styles.selected : ""}`}
                                onClick={() => setSelectedService("take_control")}
                            >
                                <div className={`${styles.serviceCardIcon} ${styles.cyan}`}>🔗</div>
                                <div className={styles.serviceCardInfo}>
                                    <h3>Add Sapiom to Your Code</h3>
                                    <p>Wrap your existing API calls with tracking</p>
                                </div>
                                {selectedService === "take_control" && (
                                    <div className={styles.checkCircle}>✓</div>
                                )}
                            </div>

                            {selectedService && (
                                <div className={styles.footerControls}>
                                    <button className={styles.continueBtn} onClick={handleNext}>
                                        Continue →
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {currentStep === 2 && (
                        <div className={styles.stepHeaderLeft}>
                            <h2 className={styles.stepTitle}>Add Your Code</h2>
                            <p className={styles.stepSubtitle}>Add the Sapiom SDK to your existing code</p>

                            <div className={styles.inputGroup}>
                                <label>Agent Name</label>
                                <input
                                    type="text"
                                    className={styles.textInput}
                                    value={agentName}
                                    onChange={(e) => setAgentName(e.target.value)}
                                />
                            </div>

                            {renderCodeBlock()}

                            <div className={styles.apiKeyBlock}>
                                <div className={styles.apiKeyHeader}>
                                    <span>Your API Key</span>
                                    <button className={styles.copyBtn} onClick={() => copyCode(MOCK_API_KEY)}>⧉ Copy</button>
                                </div>
                                <div className={styles.apiKeyValue}>{MOCK_API_KEY}</div>
                            </div>

                            <div className={styles.footerControlsSpaceBetween}>
                                <button className={styles.backBtn} onClick={handleBack}>← Back</button>
                                <div className={styles.footerRight}>
                                    <button className={styles.skipBtn} onClick={handleNext}>Skip for now</button>
                                    <button className={`${styles.continueBtn} ${styles.cyan}`} onClick={handleNext}>Continue</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {currentStep === 3 && (
                        <div className={styles.stepHeaderLeft}>
                            <h2 className={styles.stepTitle}>Test Transaction</h2>
                            <p className={styles.stepSubtitle}>Execute your code or run the dummy payload below to see tracking in action.</p>

                            <div className={styles.apiKeyBlock}>
                                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                                    <p>Listening for API requests...</p>
                                    <div style={{ color: '#00dc82', marginTop: 16 }}>Send a request using your code to continue</div>
                                </div>
                            </div>

                            <div className={styles.footerControlsSpaceBetween}>
                                <button className={styles.backBtn} onClick={handleBack}>← Back</button>
                                <div className={styles.footerRight}>
                                    <button className={styles.skipBtn} onClick={handleNext}>Skip for now</button>
                                    <button className={`${styles.continueBtn} ${styles.cyan}`} onClick={handleNext}>Simulate Request & Continue</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {currentStep === 4 && (
                        <div className={styles.stepHeaderLeft}>
                            <h2 className={styles.stepTitle} style={{ textAlign: 'center' }}>Protect Your Spending</h2>
                            <p className={styles.stepSubtitle} style={{ textAlign: 'center' }}>Create a rule to limit spend, then replay the demo to see it block transactions.</p>

                            <div className={styles.ruleCard}>
                                <div className={styles.ruleHeader}>
                                    <div className={styles.ruleIcon}>🛡️</div>
                                    <div>
                                        <h3 className={styles.ruleTitle}>Add Sapiom to Your Code Spend Limit</h3>
                                        <p className={styles.ruleDesc}>Block transactions when spend exceeds limit</p>
                                    </div>
                                </div>

                                <div className={styles.formRow}>
                                    <div className={styles.formControl}>
                                        <label>Limit Type</label>
                                        <select className={styles.selectInput}>
                                            <option>Spending</option>
                                        </select>
                                    </div>
                                    <div className={styles.formControl}>
                                        <label>Amount</label>
                                        <div className={styles.amountInputWrapper}>
                                            <span>$</span>
                                            <input type="number" className={styles.amountInput} defaultValue="0.01" step="0.01" />
                                        </div>
                                    </div>
                                    <div className={styles.formControl}>
                                        <label>Time Period</label>
                                        <select className={styles.selectInput}>
                                            <option>Per Day</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className={styles.footerControlsSpaceBetween}>
                                <button className={styles.backBtn} onClick={handleBack}>← Back</button>
                                <div className={styles.footerRight}>
                                    <button className={styles.skipBtn} onClick={handleNext}>Skip for Now</button>
                                    <button className={`${styles.continueBtn} ${styles.orange}`} onClick={handleNext}>Create Rule →</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {currentStep === 5 && (
                        <div className={styles.stepHeaderLeft}>
                            <div style={{ textAlign: 'center', marginTop: '64px' }}>
                                <div style={{ fontSize: 64, marginBottom: 24 }}>🎉</div>
                                <h2 className={styles.stepTitle}>Setup Complete!</h2>
                                <p className={styles.stepSubtitle}>You have successfully configured and tested your Sapiom integration.</p>

                                <button className={styles.continueBtn} style={{ margin: '0 auto' }} onClick={() => window.location.href = '/dashboard'}>Go to Dashboard</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}
