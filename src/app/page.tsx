"use client";

import React, { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import DashboardLayout from "./components/DashboardLayout";
import styles from "./dashboard.module.css";

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", backgroundColor: "#000", color: "#fff" }}>
        Loading...
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <DashboardLayout>
      <div className={styles.dashboardGrid}>
        <div className={styles.mainCol}>
          {/* Services Hub Banner */}
          <div className={styles.servicesHub}>
            <div className={styles.hubContent}>
              <h2>⚡ Services Hub <span className={styles.hubBadge}>12 services</span></h2>
              <p>Search, SMS, Email, Inference, Image Gen & more — one API, built-in metering</p>
            </div>
            <a href="#" className={styles.exploreLink}>Explore Services →</a>
          </div>

          {/* Welcome Card */}
          <div className={styles.welcomeCard}>
            <div className={styles.welcomeText}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                <div style={{ width: "32px", height: "32px", backgroundColor: "#00dc82", clipPath: "polygon(25% 0%, 100% 0%, 75% 100%, 0% 100%)" }}></div>
                <h1 style={{ margin: 0 }}>Welcome to Aporto!</h1>
              </div>
              <p>Complete the checklist below to get started. Switch to Analytics for your dashboard.</p>
            </div>
            <div className={styles.welcomeProgress}>
              <span className={styles.progressValue}>0/4</span>
              <span className={styles.progressLabel}>complete</span>
            </div>
          </div>

          {/* Quick Actions */}
          <div className={styles.quickActions}>
            <h3 className={styles.quickActionsHeader}>⚡ Quick Actions</h3>
            <div className={styles.actionGrid}>
              <div className={styles.actionCard}>
                <div className={styles.actionIcon}>▶️</div>
                <div className={styles.actionInfo}>
                  <h3>Interactive Guide</h3>
                  <p>Try Aporto in action</p>
                </div>
              </div>
              <div className={styles.actionCard}>
                <div className={styles.actionIcon}>📖</div>
                <div className={styles.actionInfo}>
                  <h3>View Documentation</h3>
                  <p>Integration guides</p>
                </div>
              </div>
            </div>
          </div>

          {/* Getting Started Checklist */}
          <div className={styles.checklistCard}>
            <div className={styles.checklistHeader}>
              <h3>✅ Getting Started</h3>
              <span style={{ color: "#666", fontSize: "12px" }}>0 of 4 complete</span>
            </div>

            <div className={styles.checklistItem}>
              <div className={styles.itemInfo}>
                <div className={styles.itemNumber}>1</div>
                <div className={styles.itemText}>
                  <h4>Create API Key</h4>
                  <p>Your agents use this to authenticate</p>
                </div>
              </div>
              <button className={styles.itemButton}>Create</button>
            </div>

            <div className={styles.checklistItem}>
              <div className={styles.itemInfo}>
                <div className={styles.itemNumber}>2</div>
                <div className={styles.itemText}>
                  <h4>Create a Spending Rule</h4>
                  <p>Protect your spend with automated limits</p>
                </div>
              </div>
              <button className={styles.itemButton}>Create</button>
            </div>

            <div className={styles.checklistItem}>
              <div className={styles.itemInfo}>
                <div className={styles.itemNumber}>3</div>
                <div className={styles.itemText}>
                  <h4>First Transaction</h4>
                  <p>Make your first API call through Aporto</p>
                </div>
              </div>
              <span style={{ opacity: 0.5 }}>-</span>
            </div>

            <div className={styles.checklistItem}>
              <div className={styles.itemInfo}>
                <div className={styles.itemNumber}>4</div>
                <div className={styles.itemText}>
                  <h4>Add Payment Method</h4>
                  <p>Continue after your $5 free credits</p>
                </div>
              </div>
              <button
                className={styles.itemButton}
                onClick={() => router.push("/settings?tab=billing")}
              >
                Add
              </button>
            </div>
          </div>
        </div>

        <div className={styles.rightCol}>
          {/* Balance Widget */}
          <div className={styles.widget}>
            <div className={styles.widgetHeader}>
              <span>$ Available Balance</span>
            </div>
            <div className={styles.balanceAmount}>$5.00</div>
            <button
              className={styles.addFundsBtn}
              onClick={() => router.push("/settings?tab=billing")}
            >
              + Add Funds
            </button>
          </div>

          {/* Governance Widget */}
          <div className={styles.widget}>
            <div className={styles.widgetHeader}>
              <span>🛡️ Governance</span>
              <span>+ Add</span>
            </div>
            <div className={styles.governanceText}>0 Rules Active</div>
            <div className={styles.statusIndicator}>
              ❌ Unprotected
            </div>
          </div>

          {/* Recent Activity Widget */}
          <div className={styles.widget}>
            <div className={styles.widgetHeader}>
              <span>📈 Recent Activity</span>
              <a href="#" style={{ fontSize: "12px", color: "#666" }}>View All</a>
            </div>
            <div className={styles.noActivity}>
              <div style={{ fontSize: "32px", marginBottom: "16px", opacity: 0.2 }}>📉</div>
              <p style={{ fontSize: "14px", color: "#666" }}>No recent activity</p>
              <p style={{ fontSize: "11px", color: "#444", marginTop: "8px" }}>Transactions will appear here once your agents start making requests</p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
