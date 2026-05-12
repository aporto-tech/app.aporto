"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import styles from "./new.module.css";

type SkillCategory = {
  label: string;
  description: string;
  command: string;
  skills: string[];
};

const skillCategories: SkillCategory[] = [
  {
    label: "Image generation",
    description: "Route image prompts across the best visual models without hard-coding vendors.",
    command: "aporto.runSkill({ intent: 'Nano Banana 2 1K image generation', params: { prompt } })",
    skills: [
      "Nano Banana",
      "Nano Banana 2",
      "Nano Banana 2 Pro",
      "Flux",
      "GPT Images",
      "Ideogram",
      "Recraft",
      "Qwen Image",
      "Seedream",
      "Topaz Upscale",
    ],
  },
  {
    label: "Video generation",
    description: "Send text, image, and reference prompts to video providers with automatic polling.",
    command: "aporto.runSkill({ intent: 'Sora 2 fast text to video', params: { prompt } })",
    skills: [
      "Sora 2 Fast",
      "Sora 2 Stable",
      "Veo 3.1 720P",
      "Kling 2.6",
      "Runway",
      "Wan 2.7",
      "Seedance",
      "Hailuo",
    ],
  },
  {
    label: "Search and scraping",
    description: "Give agents reliable access to data gathering skills with metered provider routing.",
    command: "aporto.runSkill({ intent: 'find LinkedIn profiles for AI agency founders' })",
    skills: [
      "Web Search",
      "AI Research",
      "LinkedIn Profiles",
      "LinkedIn Jobs",
      "Apify Actors",
      "Company Lookup",
      "Website Extraction",
      "SERP Search",
    ],
  },
  {
    label: "Audio and speech",
    description: "Generate speech, sound effects, dialogue, and music through one MCP interface.",
    command: "aporto.runSkill({ intent: 'ElevenLabs text to speech', params: { text } })",
    skills: [
      "ElevenLabs TTS",
      "Sound Effects",
      "Dialogue Audio",
      "Suno Music",
      "Speech to Text",
      "Voice Cloning",
      "Audio Cleanup",
    ],
  },
  {
    label: "LLM routing",
    description: "Use direct model access when your agent needs reasoning instead of a task skill.",
    command: "aporto.chat({ model: 'openai/gpt-4o-mini', messages })",
    skills: [
      "OpenAI",
      "Claude",
      "Gemini",
      "DeepSeek",
      "Grok",
      "Llama",
      "Qwen",
      "400+ models",
    ],
  },
];

const logoNames = ["Vercel", "Raycast", "Linear", "Retool", "Mercury", "Notion", "GitHub", "Mintlify"];

export default function NewLandingPage() {
  const [activeCategory, setActiveCategory] = useState(0);
  const current = skillCategories[activeCategory];

  return (
    <main className={styles.page}>
      <header className={styles.nav}>
        <Link href="/new" className={styles.brand} aria-label="Aporto home">
          <Image src="/logo.svg" alt="" width={28} height={28} priority />
          <span>Aporto</span>
        </Link>

        <nav className={styles.navLinks} aria-label="Primary navigation">
          <Link href="#features">Features</Link>
          <Link href="https://docs.aporto.tech">Docs</Link>
          <Link href="#ai">AI</Link>
          <Link href="#pricing">Pricing</Link>
        </nav>

        <div className={styles.navActions}>
          <Link href="/login" className={styles.loginLink}>Log in</Link>
          <Link href="/register" className={styles.navButton}>Get started</Link>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroAura} aria-hidden="true" />
        <div className={styles.heroGrid} aria-hidden="true" />

        <div className={styles.announcement}>
          <span className={styles.statusDot} />
          MCP router for production AI agents
        </div>

        <h1>Turn Any AI Agent Into a Full AI Workforce</h1>
        <p className={styles.heroCopy}>
          Add MCP router to your AI Agent and instantly route tasks across 1000+ skills and providers
          with <span className={styles.typeCycle} aria-label="automatic load balancing, failover, and best-result selection">
            <span>automatic load balancing</span>
            <span>failover</span>
            <span>best-result selection</span>
          </span>
        </p>

        <div className={styles.heroActions}>
          <Link href="/register" className={styles.primaryCta}>Get started</Link>
          <Link href="https://docs.aporto.tech" className={styles.secondaryCta}>Documentation</Link>
        </div>

        <div className={styles.terminalPreview} aria-label="Aporto MCP router preview">
          <div className={styles.terminalTop}>
            <span />
            <span />
            <span />
          </div>
          <pre>{`agent.task("create launch visuals")
  -> Aporto MCP Router
  -> Image generation: Nano Banana 2
  -> Provider health: 99.8%
  -> Result stored on S3`}</pre>
        </div>
      </section>

      <section className={styles.trustSection}>
        <p>Access MCP skills from companies of all sizes through the Aporto router.</p>
        <div className={styles.logoRail} aria-label="Trusted company logos placeholder">
          {logoNames.map((name) => (
            <span key={name}>{name}</span>
          ))}
        </div>
      </section>

      <section id="features" className={styles.integrateSection}>
        <div className={styles.sectionIntro}>
          <span>Integrate this morning</span>
          <h2>A simple, elegant interface so you can start using skills in minutes.</h2>
          <p>
            It fits right into your code with SDKs for your favorite programming languages.
          </p>
        </div>

        <div className={styles.skillExplorer}>
          <div className={styles.tabs} role="tablist" aria-label="Skill categories">
            {skillCategories.map((category, index) => (
              <button
                key={category.label}
                type="button"
                role="tab"
                aria-selected={activeCategory === index}
                className={activeCategory === index ? styles.activeTab : undefined}
                onClick={() => setActiveCategory(index)}
              >
                {category.label}
              </button>
            ))}
          </div>

          <div className={styles.skillPanel}>
            <div className={styles.skillList}>
              <div>
                <span className={styles.panelKicker}>{current.label}</span>
                <h3>{current.description}</h3>
              </div>
              <div className={styles.skillChips}>
                {current.skills.map((skill) => (
                  <span key={skill}>{skill}</span>
                ))}
              </div>
            </div>

            <div className={styles.codeCard}>
              <div className={styles.codeHeader}>
                <span>mcp-client.ts</span>
                <span>TypeScript</span>
              </div>
              <pre>{`import { Aporto } from "@aporto-tech/sdk";

const aporto = new Aporto({
  apiKey: process.env.APORTO_API_KEY,
});

const result = await ${current.command};

console.log(result.artifact?.url);`}</pre>
            </div>
          </div>
        </div>
      </section>

      <section id="ai" className={styles.featureBand}>
        <div>
          <span>Built for agent operators</span>
          <h2>One router, every skill, fewer brittle provider decisions.</h2>
        </div>
        <div className={styles.featureGrid}>
          <article>
            <h3>Automatic load balancing</h3>
            <p>Route traffic across active providers based on price, latency, and health.</p>
          </article>
          <article>
            <h3>Failover by default</h3>
            <p>Recover from provider outages without rewriting your agent workflow.</p>
          </article>
          <article>
            <h3>Best-result selection</h3>
            <p>Keep the agent focused on the output while Aporto handles the execution path.</p>
          </article>
        </div>
      </section>
    </main>
  );
}
