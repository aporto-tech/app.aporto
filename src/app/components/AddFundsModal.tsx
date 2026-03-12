"use client";

import React, { useState, useEffect } from "react";
import styles from "./addFundsModal.module.css";
import { useRouter } from "next/navigation";
import { initializePaddle, Paddle } from "@paddle/paddle-js";

interface AddFundsModalProps {
    onClose: () => void;
}

const PACKAGES = [
    { id: "pkg_50", price: 50, credits: "10,000", badge: null },
    { id: "pkg_500", price: 500, credits: "105,000", badge: "SAVE 5%" },
    { id: "pkg_1250", price: 1250, credits: "275,000", badge: "SAVE 10%" },
];

const PAYMENT_METHODS = [
    { id: "card", label: "Card", icon: "💳" },
    { id: "paypal", label: "PayPal", icon: "🅿️" }, // using emoji for simplicity, or we can use SVG
    { id: "apple", label: "Apple", icon: "" },
    { id: "crypto", label: "Crypto", icon: "₿" },
    { id: "more", label: "...", icon: "" },
];

export default function AddFundsModal({ onClose }: AddFundsModalProps) {
    const router = useRouter();
    const [selectedPackage, setSelectedPackage] = useState(PACKAGES[0].id);
    const [selectedMethod, setSelectedMethod] = useState("crypto");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [paddle, setPaddle] = useState<Paddle | null>(null);

    useEffect(() => {
        // Initialize Paddle
        const initPaddle = async () => {
            try {
                const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
                if (!token) {
                    console.warn("Paddle client token is missing. Please set NEXT_PUBLIC_PADDLE_CLIENT_TOKEN.");
                    return;
                }
                const paddleInstance = await initializePaddle({
                    environment: process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT === "production" ? "production" : "sandbox",
                    token: token,
                });
                if (paddleInstance) {
                    setPaddle(paddleInstance);
                }
            } catch (err) {
                console.error("Failed to initialize Paddle", err);
            }
        };
        initPaddle();
    }, []);

    const handleBuy = async () => {
        setIsLoading(true);
        setError("");
        
        const pkg = PACKAGES.find(p => p.id === selectedPackage);
        if (!pkg) return;

        try {
            if (selectedMethod === "crypto") {
                // Call NOWPayments endpoint
                const res = await fetch("/api/payments/nowpayments", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ amount: pkg.price, packageId: pkg.id })
                });
                
                const data = await res.json();
                
                if (data.success && data.invoiceUrl) {
                    window.location.href = data.invoiceUrl;
                } else {
                    setError(data.message || "Failed to create crypto invoice.");
                }
            } else {
                // Handle Paddle Checkout (Card, PayPal, Apple Pay)
                if (!paddle) {
                    setError("Payment system is not ready or misconfigured.");
                    return;
                }

                // Map package ID to Paddle Price ID from env variables
                const priceMap: Record<string, string> = {
                    "pkg_50": process.env.NEXT_PUBLIC_PADDLE_PRICE_50 || "",
                    "pkg_500": process.env.NEXT_PUBLIC_PADDLE_PRICE_500 || "",
                    "pkg_1250": process.env.NEXT_PUBLIC_PADDLE_PRICE_1250 || "",
                };

                const priceId = priceMap[pkg.id];
                
                if (!priceId) {
                    setError("Price ID not configured for this package.");
                    return;
                }

                paddle.Checkout.open({
                    items: [
                        { priceId, quantity: 1 }
                    ],
                    customData: {
                        packageId: pkg.id,
                        paymentMethod: selectedMethod
                    }
                });

                // Since Paddle overlay opens, we can stop loading
            }
        } catch (err) {
            setError("Something went wrong. Please try again.");
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className={styles.modalOverlay} onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
        }}>
            <div className={styles.modalContent}>
                <button className={styles.closeButton} onClick={onClose}>✕</button>
                
                <h2 className={styles.modalTitle}>Add Credits</h2>

                <div className={styles.sectionTitle}>Select Package</div>
                <div className={styles.packagesGrid}>
                    {PACKAGES.map((pkg) => (
                        <div 
                            key={pkg.id} 
                            className={`${styles.packageCard} ${selectedPackage === pkg.id ? styles.selected : ""}`}
                            onClick={() => setSelectedPackage(pkg.id)}
                        >
                            {pkg.badge && (
                                <div style={{ overflow: "hidden", position: "absolute", top: 0, right: 0, width: "60px", height: "60px" }}>
                                    <div className={styles.saveBadge}>{pkg.badge}</div>
                                </div>
                            )}
                            <div className={styles.price}>${pkg.price}</div>
                            <div className={styles.credits}>{pkg.credits} credits</div>
                        </div>
                    ))}
                </div>

                <div className={styles.sectionTitle}>Payment Method</div>
                <div className={styles.paymentGrid}>
                    {PAYMENT_METHODS.map((method) => {
                        const isSelected = selectedMethod === method.id;
                        return (
                            <div 
                                key={method.id}
                                className={`${styles.paymentMethod} ${isSelected ? styles.selected : ""}`}
                                onClick={() => setSelectedMethod(method.id)}
                            >
                                {method.id === "card" && (
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={styles.paymentIcon}>
                                        <rect x="2" y="5" width="20" height="14" rx="2" />
                                        <line x1="2" y1="10" x2="22" y2="10" />
                                    </svg>
                                )}
                                {method.id === "paypal" && (
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className={styles.paymentIcon}>
                                        <path d="M7.076 21.337H2.47a.64.64 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106zM6.92 14.28h2.33c3.606 0 6.44-1.396 7.27-5.65.043-.222.08-.439.11-.649.2-1.31.026-2.222-.505-2.825-.68-.78-2.12-1.19-4.22-1.19H6.185L4.47 14.28h2.45z"/>
                                    </svg>
                                )}
                                {method.id === "apple" && (
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className={styles.paymentIcon}>
                                        <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.123 3.792 3.04 1.52-.084 2.096-.952 3.935-.952 1.828 0 2.38.932 3.962.952 1.631.02 2.662-1.465 3.664-2.936 1.163-1.696 1.64-3.34 1.66-3.425-.038-.016-3.219-1.233-3.24-4.942-.02-3.1 2.532-4.593 2.656-4.664-1.452-2.126-3.708-2.433-4.526-2.477-1.745-.084-3.493 1.12-4.402 1.12-.916 0-2.383-1.036-3.864-1.036"/>
                                        <path d="M15.144 4.542c.84-.963 1.4-2.302 1.246-3.642-1.162.046-2.583.73-3.447 1.716-.763.856-1.432 2.226-1.246 3.535 1.298.093 2.616-.653 3.447-1.61z"/>
                                    </svg>
                                )}
                                {method.id === "crypto" && (
                                    <>
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className={styles.paymentIcon}>
                                            <path d="M14.498 10.375c1.604-.499 2.124-2.007 1.258-3.33-1.025-1.571-3.155-1.897-4.981-1.897H8.868v1.34h1.03v7.352H8.868v1.341h2.954V11.83h1.365c1.19 0 2.378-.052 3.056.883.674.927.674 2.052.674 3.007h1.53c0-1.428-.184-2.73-1.449-3.702-.991-.762-1.928-.962-2.497-1.643zm-3.6-1.558v-3.04h1.86c1.166 0 2.274.075 2.518,1.383.272 1.456-.99 1.657-2.146 1.657H10.9zm13.1-4.817H12v2.106h9.914v11.859H12v2.127h12V4zm-21.914 2H12V4H2.086v16H12v-2.127H2.086V6.001z"/>
                                        </svg>
                                        Crypto
                                    </>
                                )}
                                {method.id === "more" && (
                                    <span>...</span>
                                )}
                            </div>
                        );
                    })}
                </div>

                {error && <div style={{ color: "#ef4444", marginBottom: "16px", fontSize: "14px", textAlign: "center" }}>{error}</div>}

                <button 
                    className={styles.buyButton} 
                    onClick={handleBuy}
                    disabled={isLoading}
                >
                    {isLoading ? "Processing..." : "Buy Credits"}
                </button>
            </div>
        </div>
    );
}
