"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import styles from "./new.module.css";

type SkillCategory = {
  label: string;
  count: string;
  description: string;
  command: string;
  skills: string[];
};

const skillCategories: SkillCategory[] = [
  {
    label: "Image generation",
    count: "180+ skills",
    description: "Generate, edit, upscale, reframe, remove backgrounds, and route prompts across visual models.",
    command: "aporto.runSkill({ intent: 'Nano Banana 2 1K image generation', params: { prompt } })",
    skills: ["Nano Banana", "Nano Banana 2", "Nano Banana 2 Pro", "Flux", "GPT Images", "Ideogram", "Recraft", "Qwen Image", "Seedream", "Topaz Upscale"],
  },
  {
    label: "Video generation",
    count: "140+ skills",
    description: "Create video from text, images, references, speech, and motion controls with automatic polling.",
    command: "aporto.runSkill({ intent: 'Sora 2 fast text to video', params: { prompt } })",
    skills: ["Sora 2 Fast", "Sora 2 Stable", "Veo 3.1 720P", "Kling 2.6", "Runway", "Wan 2.7", "Seedance", "Hailuo", "Lip Sync", "Video Upscale"],
  },
  {
    label: "Search and scraping",
    count: "220+ skills",
    description: "Find, scrape, enrich, and verify web data through managed providers and structured outputs.",
    command: "aporto.runSkill({ intent: 'find LinkedIn profiles for AI agency founders' })",
    skills: ["Web Search", "AI Research", "LinkedIn Profiles", "LinkedIn Jobs", "Apify Actors", "Company Lookup", "Website Extraction", "SERP Search"],
  },
  {
    label: "Audio and speech",
    count: "95+ skills",
    description: "Generate speech, dialogue, sound effects, music, transcription, and voice workflows.",
    command: "aporto.runSkill({ intent: 'ElevenLabs text to speech', params: { text } })",
    skills: ["ElevenLabs TTS", "Sound Effects", "Dialogue Audio", "Suno Music", "Speech to Text", "Voice Cloning", "Audio Cleanup", "Podcast Clips"],
  },
  {
    label: "LLM routing",
    count: "400+ models",
    description: "Route reasoning and chat workloads across model families from one interface.",
    command: "aporto.chat({ model: 'openai/gpt-4o-mini', messages })",
    skills: ["OpenAI", "Claude", "Gemini", "DeepSeek", "Grok", "Llama", "Qwen", "Mistral", "Perplexity", "400+ models"],
  },
  {
    label: "Automation",
    count: "120+ skills",
    description: "Let agents trigger repeatable business workflows without custom provider glue.",
    command: "aporto.runSkill({ intent: 'automate lead enrichment workflow', params })",
    skills: ["Lead Enrichment", "CRM Updates", "Email Workflows", "Form Filling", "Data Cleanup", "Research Agents", "Browser Actions"],
  },
  {
    label: "Documents",
    count: "80+ skills",
    description: "Parse, summarize, classify, and transform documents with traceable execution logs.",
    command: "aporto.runSkill({ intent: 'extract invoice fields from PDF', params: { fileUrl } })",
    skills: ["PDF Extraction", "Invoice Parsing", "Contract Review", "OCR", "Summaries", "Classification", "Table Extraction"],
  },
  {
    label: "Commerce",
    count: "60+ skills",
    description: "Power catalog, marketplace, and product workflows with specialized AI capabilities.",
    command: "aporto.runSkill({ intent: 'generate ecommerce product media', params })",
    skills: ["Product Images", "Descriptions", "Review Mining", "Price Tracking", "Catalog Cleanup", "Market Research"],
  },
  {
    label: "Developer tools",
    count: "75+ skills",
    description: "Give builders generation, QA, extraction, and diagnostics skills through the same MCP router.",
    command: "aporto.runSkill({ intent: 'debug failed API request', params })",
    skills: ["Code Review", "API Debugging", "Docs Generation", "Test Data", "Error Analysis", "Log Search", "SDK Helpers"],
  },
];

const logoNames = ["Vercel", "Raycast", "Linear", "Retool", "Mercury", "Notion", "GitHub", "Mintlify"];

const audienceCards = [
  "Developers building AI apps and agents",
  "Content creators producing videos, scripts, and media",
  "Startups building AI-powered products",
  "Teams automating business workflows",
  "Operators connecting AI tools into repeatable systems",
];

const howItWorks = [
  ["Connect your system", "Integrate Aporto via MCP in minutes."],
  ["Send requests normally", "Your app sends tasks like usual."],
  ["Aporto routes everything", "Each request is automatically sent to the best model, tool, or skill."],
  ["Get optimized results", "Higher quality, lower cost, better reliability."],
];

const engineSignals = [
  "Best capability for the task",
  "Fastest execution option",
  "Most cost-efficient route",
  "Fallback if a skill fails",
  "Load balancing across providers",
];

const controlItems = [
  "Pin specific skills or providers",
  "Define routing rules per workflow",
  "Control cost vs quality tradeoffs",
  "View execution logs",
  "Debug every request",
  "Override routing decisions",
];

const comparisons = [
  ["One provider", "Multi-provider routing"],
  ["Manual scaling", "Automatic load balancing"],
  ["Downtime risk", "Automatic failover"],
  ["Hardcoded workflows", "Dynamic skill routing"],
  ["Multiple integrations", "One MCP integration"],
];

const faqs = [
  {
    question: "What is Aporto in simple terms?",
    answer: "Aporto is an AI execution layer that connects your apps, workflows, or agents to 1000+ AI skills. Instead of manually integrating tools, you send one request and Aporto routes it to the best skill automatically.",
  },
  {
    question: "Why do I need this if I can just use AI tools directly?",
    answer: "Single tools do not scale. Without Aporto, you integrate each tool separately, decide manually what to use, handle failures yourself, and maintain multiple systems. With Aporto, one integration replaces many tools, skills are selected automatically, failures are handled for you, and your system scales without extra infrastructure.",
  },
  {
    question: "Do I lose control over what is happening?",
    answer: "No. You gain control. Aporto can route automatically by default, follow your exact rules, or run fully deterministic workflows. You can override decisions, pin specific skills, and inspect execution logs.",
  },
  {
    question: "What if Aporto chooses the wrong skill?",
    answer: "You can prevent that with rules per task type, cost vs quality preferences, allowed skill groups, and fallback logic. Every execution is visible, traceable, and explainable.",
  },
  {
    question: "Can I use Aporto without coding?",
    answer: "Yes. Non-developers can create content workflows, automate repetitive tasks, generate media and scripts, and connect AI tools together. Developers can go deeper and build full AI systems.",
  },
  {
    question: "Will this increase my costs?",
    answer: "Usually no, and often the opposite. Aporto helps reduce cost by choosing cheaper skills when possible, avoiding unnecessary high-cost execution, reducing redundant integrations, and improving efficiency per request. You only pay for actual usage.",
  },
  {
    question: "What makes Aporto different from other AI APIs?",
    answer: "Most APIs give access to a single capability. Aporto gives you a network of AI skills, automatic routing between skills, the ability to combine skills into workflows, and scalable execution infrastructure.",
  },
];

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
          <p>It fits right into your code with SDKs for your favorite programming languages.</p>
        </div>

        <div className={styles.skillStats}>
          <div>
            <strong>1000+</strong>
            <span>available AI skills</span>
          </div>
          <div>
            <strong>9</strong>
            <span>skill categories shown here</span>
          </div>
          <div>
            <strong>1</strong>
            <span>MCP integration</span>
          </div>
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
                <span>{category.label}</span>
                <small>{category.count}</small>
              </button>
            ))}
          </div>

          <div className={styles.skillPanel}>
            <div className={styles.skillList}>
              <div>
                <span className={styles.panelKicker}>{current.count}</span>
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

      <section id="ai" className={styles.audienceSection}>
        <div className={styles.sectionIntro}>
          <span>Who is this for?</span>
          <h2>Aporto is built for anyone working with AI.</h2>
          <p>If AI is part of your workflow, Aporto makes it faster, cheaper, and more powerful.</p>
        </div>
        <div className={styles.audienceGrid}>
          {audienceCards.map((item) => (
            <article key={item}>
              <span />
              <h3>{item}</h3>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.processSection}>
        <div className={styles.sectionIntro}>
          <span>How it works</span>
          <h2>Four steps from normal task requests to optimized execution.</h2>
        </div>
        <div className={styles.processGrid}>
          {howItWorks.map(([title, body], index) => (
            <article key={title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.engineSection}>
        <div className={styles.engineCard}>
          <div>
            <span className={styles.panelKicker}>Smart Execution Engine</span>
            <h2>Every request is matched to the best skill in real time.</h2>
          </div>
          <ul>
            {engineSignals.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className={styles.engineCard}>
          <div>
            <span className={styles.panelKicker}>Full control included</span>
            <h2>Aporto is not a black box.</h2>
            <p>You can define the routing behavior that fits each workflow.</p>
          </div>
          <ul>
            {controlItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className={styles.comparisonSection}>
        <div className={styles.sectionIntro}>
          <span>Why Aporto instead of direct APIs</span>
          <h2>One integration replaces brittle provider-by-provider plumbing.</h2>
        </div>
        <div className={styles.comparisonTable}>
          <div className={styles.tableHead}>
            <span>Direct API</span>
            <span>Aporto</span>
          </div>
          {comparisons.map(([direct, aporto]) => (
            <div className={styles.tableRow} key={direct}>
              <span>{direct}</span>
              <span>{aporto}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.faqSection}>
        <div className={styles.sectionIntro}>
          <span>FAQ</span>
          <h2>Answers for builders, creators, and teams.</h2>
        </div>
        <div className={styles.faqList}>
          {faqs.map((faq) => (
            <details key={faq.question}>
              <summary>{faq.question}</summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section id="pricing" className={styles.pricingSection}>
        <div className={styles.pricingCard}>
          <span>Pricing note</span>
          <h2>Free to start. Pay only for routed usage.</h2>
          <div className={styles.pricingBullets}>
            <span>No setup fees</span>
            <span>No long-term contracts</span>
            <span>Scale as you grow</span>
          </div>
          <p>Aporto is not a tool. It is the execution layer between your product and 1000+ AI capabilities.</p>
          <Link href="/register" className={styles.primaryCta}>Start Building</Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerBrand}>
          <Image src="/logo.svg" alt="" width={28} height={28} />
          <span>Aporto</span>
        </div>
        <div className={styles.footerColumns}>
          <div>
            <strong>Product</strong>
            <Link href="#features">Features</Link>
            <Link href="#ai">AI</Link>
            <Link href="#pricing">Pricing</Link>
          </div>
          <div>
            <strong>Developers</strong>
            <Link href="https://docs.aporto.tech">Documentation</Link>
            <Link href="/services">Skills</Link>
            <Link href="/login">Dashboard</Link>
          </div>
          <div>
            <strong>Company</strong>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/register">Get started</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
