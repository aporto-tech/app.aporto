"use client";

import React, { useState, useEffect } from "react";
import styles from "./addFundsModal.module.css";
import { useRouter } from "next/navigation";
import { initializePaddle, Paddle } from "@paddle/paddle-js";

interface AddFundsModalProps {
    onClose: () => void;
}

const PACKAGES = [
    { id: "pkg_50", price: 50, badge: null },
    { id: "pkg_500", price: 500, badge: "SAVE 5%" },
    { id: "pkg_1250", price: 1250, badge: "SAVE 10%" },
];

const PAYMENT_METHODS = [
    { id: "card", label: "Card", icon: "/visa-mastercard.svg" },
    { id: "paypal", label: "PayPal", icon: "/paypal.svg" },
    { id: "apple", label: "Apple", icon: "/apple-pay.svg" },
    { id: "crypto", label: "Crypto", icon: "/crypto.svg" },
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
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                        <img src="https://upload.wikimedia.org/wikipedia/commons/5/5e/Visa_Inc._logo.svg" className={styles.paymentIcon} alt="Visa" />
                                        <img src="https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg" className={styles.paymentIcon} alt="Mastercard" />
                                    </div>
                                )}
                                {method.id === "paypal" && (
                                    <img src="https://upload.wikimedia.org/wikipedia/commons/b/b5/PayPal.svg" className={styles.paymentIcon} alt="PayPal" />
                                )}
                                {method.id === "apple" && (
                                    <img src="https://upload.wikimedia.org/wikipedia/commons/b/b0/Apple_Pay_logo.svg" className={styles.paymentIcon} alt="Apple Pay" />
                                )}
                                {method.id === "crypto" && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <img src="https://upload.wikimedia.org/wikipedia/commons/4/46/Bitcoin.svg" className={styles.paymentIcon} alt="Bitcoin" />
                                        <span>Crypto</span>
                                    </div>
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
