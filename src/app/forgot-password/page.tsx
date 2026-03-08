"use client";

import React, { useState } from "react";
import styles from "../login/styles.module.css";
import Link from "next/link";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError("");
        setMessage("");

        try {
            const response = await fetch("/api/auth/reset-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Something went wrong");
            }

            setMessage(data.message);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className={styles.loginContainer}>
            <div className={styles.leftSection}>
                <div className={styles.branding}>
                    <div className={styles.logoContainer}>
                        <div className={styles.logoIcon}>A</div>
                        <div className={styles.logoText}>aporto</div>
                    </div>
                    <div className={styles.tagline}>
                        <span>Reset Password.</span>
                        <span>Regain access to your account.</span>
                    </div>
                </div>
            </div>

            <div className={styles.rightSection}>
                <div className={styles.loginCard}>
                    <h1 className={styles.title}>Forgot Password</h1>
                    <p className={styles.subtitle}>Enter your email to receive a reset link</p>

                    <form onSubmit={handleSubmit}>
                        {error && <div style={{ color: "#ff4d4d", marginBottom: "16px", textAlign: "center", fontSize: "14px" }}>{error}</div>}
                        {message && <div style={{ color: "var(--accent-color)", marginBottom: "16px", textAlign: "center", fontSize: "14px" }}>{message}</div>}

                        <div className={styles.formGroup}>
                            <label className={styles.label}>Email Address</label>
                            <input
                                type="email"
                                className={styles.input}
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            className={styles.signInButton}
                            disabled={isLoading}
                        >
                            {isLoading ? "Sending link..." : "Send Reset Link"}
                        </button>
                    </form>

                    <p className={styles.footer}>
                        Remembered your password? <Link href="/login" className={styles.signUpLink}>Login</Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
