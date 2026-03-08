"use client";

import React, { useState, Suspense } from "react";
import styles from "../login/styles.module.css";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function ResetPasswordForm() {
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get("token");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (password !== confirmPassword) {
            setError("Passwords do not match");
            return;
        }

        setIsLoading(true);
        setError("");
        setMessage("");

        try {
            const response = await fetch("/api/auth/update-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, password }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Something went wrong");
            }

            setMessage("Password updated successfully. Redirecting to login...");
            setTimeout(() => {
                router.push("/login");
            }, 2000);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    if (!token) {
        return (
            <div className={styles.loginCard}>
                <h1 className={styles.title}>Error</h1>
                <p className={styles.subtitle}>Missing or invalid reset token.</p>
                <Link href="/login" className={styles.signInButton} style={{ textAlign: "center", display: "block" }}>
                    Back to Login
                </Link>
            </div>
        );
    }

    return (
        <div className={styles.loginCard}>
            <h1 className={styles.title}>New Password</h1>
            <p className={styles.subtitle}>Set a new password for your account</p>

            <form onSubmit={handleSubmit}>
                {error && <div style={{ color: "#ff4d4d", marginBottom: "16px", textAlign: "center", fontSize: "14px" }}>{error}</div>}
                {message && <div style={{ color: "var(--accent-color)", marginBottom: "16px", textAlign: "center", fontSize: "14px" }}>{message}</div>}

                <div className={styles.formGroup}>
                    <label className={styles.label}>New Password</label>
                    <input
                        type="password"
                        className={styles.input}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={8}
                    />
                </div>

                <div className={styles.formGroup}>
                    <label className={styles.label}>Confirm New Password</label>
                    <input
                        type="password"
                        className={styles.input}
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        minLength={8}
                    />
                </div>

                <button
                    type="submit"
                    className={styles.signInButton}
                    disabled={isLoading}
                >
                    {isLoading ? "Updating..." : "Update Password"}
                </button>
            </form>
        </div>
    );
}

export default function ResetPasswordPage() {
    return (
        <div className={styles.loginContainer}>
            <div className={styles.leftSection}>
                <div className={styles.branding}>
                    <div className={styles.logoContainer}>
                        <img src="/logo.svg" alt="Aporto Logo" width={32} height={32} />
                        <div className={styles.logoText}>aporto</div>
                    </div>
                    <div className={styles.tagline}>
                        <span>Security First.</span>
                        <span>Update your credentials.</span>
                    </div>
                </div>
            </div>

            <div className={styles.rightSection}>
                <Suspense fallback={<div>Loading...</div>}>
                    <ResetPasswordForm />
                </Suspense>
            </div>
        </div>
    );
}
