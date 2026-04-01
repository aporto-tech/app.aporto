"use client";

import React, { useState, useEffect, useCallback } from "react";
import styles from "../login/styles.module.css";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";

type Step = "form" | "otp";

export default function RegisterPage() {
    const [step, setStep] = useState<Step>("form");
    // formData holds email + password for the OTP step auto-login.
    // Password lives in React state only for the duration of the OTP flow.
    const [formData, setFormData] = useState({ email: "", password: "", name: "" });
    const [otp, setOtp] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    // Countdown in seconds before "Resend code" becomes available again
    const [resendCountdown, setResendCountdown] = useState(0);
    const router = useRouter();

    // Tick down the resend cooldown every second
    useEffect(() => {
        if (resendCountdown <= 0) return;
        const id = setTimeout(() => setResendCountdown((c) => c - 1), 1000);
        return () => clearTimeout(id);
    }, [resendCountdown]);

    // ── Step 1: registration form ───────────────────────────────────────────
    const handleRegisterSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError("");

        try {
            const response = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Something went wrong");
            }

            if (data.requiresVerification) {
                setResendCountdown(60);
                setStep("otp");
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    // ── Step 2: OTP verification ────────────────────────────────────────────
    const handleOtpSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError("");

        try {
            const response = await fetch("/api/auth/verify-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: formData.email, code: otp }),
            });

            const data = await response.json();

            if (!response.ok) {
                if (response.status === 410) {
                    throw new Error("Code expired — click 'Resend code' to get a new one");
                }
                throw new Error(data.error || "Invalid code");
            }

            // Auto-login: password is held in state for exactly this moment.
            const res = await signIn("credentials", {
                email: formData.email,
                password: formData.password,
                redirect: false,
            });

            if (res?.error) {
                throw new Error("Login failed after verification. Please go to login page.");
            }

            router.push("/dashboard");
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    // ── Resend OTP ──────────────────────────────────────────────────────────
    const handleResend = useCallback(async () => {
        if (resendCountdown > 0) return;
        setError("");

        try {
            const response = await fetch("/api/auth/resend-otp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: formData.email }),
            });

            const data = await response.json();

            if (!response.ok) {
                if (response.status === 429) {
                    setResendCountdown(data.retryAfter ?? 60);
                    setError(`Please wait ${data.retryAfter ?? 60}s before requesting a new code`);
                    return;
                }
                throw new Error(data.error || "Failed to resend code");
            }

            setResendCountdown(60);
            setOtp("");
        } catch (err: any) {
            setError(err.message);
        }
    }, [formData.email, resendCountdown]);

    // ── Render ──────────────────────────────────────────────────────────────
    return (
        <div className={styles.loginContainer}>
            <div className={styles.leftSection}>
                <div className={styles.branding}>
                    <div className={styles.logoContainer}>
                        <img src="/logo.svg" alt="Aporto Logo" width={32} height={32} />
                        <div className={styles.logoText}>aporto</div>
                    </div>
                    <div className={styles.tagline}>
                        <span>Join Aporto.</span>
                        <span>Get started in minutes.</span>
                    </div>
                </div>
            </div>

            <div className={styles.rightSection}>
                <div className={styles.loginCard}>

                    {/* ── Step 1: Registration form ── */}
                    {step === "form" && (
                        <>
                            <h1 className={styles.title}>Create Account</h1>
                            <p className={styles.subtitle}>Sign up to get started</p>

                            <form onSubmit={handleRegisterSubmit}>
                                {error && (
                                    <div style={{ color: "#ff4d4d", marginBottom: "16px", textAlign: "center", fontSize: "14px" }}>
                                        {error}
                                    </div>
                                )}

                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Full Name</label>
                                    <input
                                        type="text"
                                        className={styles.input}
                                        placeholder="John Doe"
                                        value={formData.name}
                                        onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                                        required
                                    />
                                </div>

                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Email</label>
                                    <input
                                        type="email"
                                        className={styles.input}
                                        placeholder="you@example.com"
                                        value={formData.email}
                                        onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))}
                                        required
                                    />
                                </div>

                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Password</label>
                                    <input
                                        type="password"
                                        className={styles.input}
                                        placeholder="••••••••"
                                        value={formData.password}
                                        onChange={(e) => setFormData((f) => ({ ...f, password: e.target.value }))}
                                        required
                                    />
                                </div>

                                <button
                                    type="submit"
                                    className={styles.signInButton}
                                    disabled={isLoading}
                                >
                                    {isLoading ? "Creating account..." : "Sign Up"}
                                </button>
                            </form>

                            <p className={styles.footer}>
                                Already have an account?{" "}
                                <Link href="/login" className={styles.signUpLink}>Login</Link>
                            </p>
                        </>
                    )}

                    {/* ── Step 2: OTP input ── */}
                    {step === "otp" && (
                        <>
                            <h1 className={styles.title}>Check your email</h1>
                            <p className={styles.subtitle}>
                                We sent a 6-digit code to <strong>{formData.email}</strong>
                            </p>

                            <form onSubmit={handleOtpSubmit}>
                                {error && (
                                    <div style={{ color: "#ff4d4d", marginBottom: "16px", textAlign: "center", fontSize: "14px" }}>
                                        {error}
                                    </div>
                                )}

                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Verification code</label>
                                    <input
                                        type="text"
                                        className={styles.input}
                                        placeholder="123456"
                                        value={otp}
                                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                        inputMode="numeric"
                                        autoComplete="one-time-code"
                                        maxLength={6}
                                        required
                                    />
                                </div>

                                <button
                                    type="submit"
                                    className={styles.signInButton}
                                    disabled={isLoading || otp.length !== 6}
                                >
                                    {isLoading ? "Verifying..." : "Verify email"}
                                </button>
                            </form>

                            <p className={styles.footer} style={{ marginTop: "16px" }}>
                                {resendCountdown > 0 ? (
                                    <span style={{ color: "#888" }}>Resend code in {resendCountdown}s</span>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={handleResend}
                                        style={{
                                            background: "none",
                                            border: "none",
                                            cursor: "pointer",
                                            padding: 0,
                                        }}
                                        className={styles.signUpLink}
                                    >
                                        Resend code
                                    </button>
                                )}
                            </p>

                            <p className={styles.footer}>
                                <button
                                    type="button"
                                    onClick={() => { setStep("form"); setError(""); setOtp(""); }}
                                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                                    className={styles.signUpLink}
                                >
                                    Use a different email
                                </button>
                            </p>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
