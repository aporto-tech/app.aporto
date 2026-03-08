"use client";

import React, { useState } from "react";
import styles from "../login/styles.module.css";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";

export default function RegisterPage() {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError("");

        try {
            const response = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email, password }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Something went wrong");
            }

            // Auto-login the user immediately after successful registration
            const res = await signIn("credentials", {
                email,
                password,
                redirect: false,
            });

            if (res?.error) {
                throw new Error("Login failed: " + res.error);
            }

            // Redirect directly to dashboard upon successful auto-login
            router.push("/dashboard");
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
                    <h1 className={styles.title}>Create Account</h1>
                    <p className={styles.subtitle}>Sign up to get started</p>

                    <form onSubmit={handleSubmit}>
                        {error && <div style={{ color: "#ff4d4d", marginBottom: "16px", textAlign: "center", fontSize: "14px" }}>{error}</div>}

                        <div className={styles.formGroup}>
                            <label className={styles.label}>Full Name</label>
                            <input
                                type="text"
                                className={styles.input}
                                placeholder="John Doe"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <label className={styles.label}>Email</label>
                            <input
                                type="email"
                                className={styles.input}
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <label className={styles.label}>Password</label>
                            <input
                                type="password"
                                className={styles.input}
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
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
                        Already have an account? <Link href="/login" className={styles.signUpLink}>Login</Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
