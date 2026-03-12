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
                
                <h2 className={styles.modalTitle}>Add Funds</h2>

                <div className={styles.sectionTitle}>Select Package</div>
                <div className={styles.packagesGrid}>
                    {PACKAGES.map((pkg) => (
                        <div 
                            key={pkg.id} 
                            className={`${styles.packageCard} ${selectedPackage === pkg.id ? styles.selected : ""}`}
                            onClick={() => setSelectedPackage(pkg.id)}
                        >
                            {pkg.badge && (
                                <div className={styles.saveBadge}>{pkg.badge}</div>
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
                                <div className={styles.paymentIcon}>
                                    {method.id === "card" && (
                                        <svg width="32" height="32" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <rect width="48" height="32" rx="4" fill="#2D2D2D"/>
                                            <path d="M12 24H36M12 28H24" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                                            <circle cx="36" cy="12" r="4" fill="#EB001B"/>
                                            <circle cx="40" cy="12" r="4" fill="#F79E1B" fillOpacity="0.8"/>
                                        </svg>
                                    )}
                                    {method.id === "paypal" && (
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M7.076 21.337H2.47a.64.64 0 01-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106z"/>
                                        </svg>
                                    )}
                                    {method.id === "apple" && (
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M17.057 12.783c.032 2.585 2.117 3.445 2.148 3.462-.011.054-.319 1.084-1.069 2.179-.648.944-1.32 1.884-2.387 1.903-1.048.02-1.385-.613-2.585-.613-1.2 0-1.571.613-2.56.632-.992.02-1.746-.864-2.397-1.808-1.334-1.93-2.35-5.452-.977-7.828.683-1.176 1.911-1.92 3.232-1.94 1.012-.02 1.968.679 2.585.679.617 0 1.791-.865 2.997-.743.504.021 1.919.202 2.829 1.531-.073.045-1.693.982-1.671 2.943zm-2.164-10.271c.544-.659.911-1.575.811-2.491-.787.031-1.734.524-2.3 1.183-.509.593-.956 1.503-.838 2.399.876.068 1.782-.432 2.327-1.091z"/>
                                        </svg>
                                    )}
                                    {method.id === "crypto" && (
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M23.638 14.904c-1.602 6.43-8.113 10.34-14.542 8.736C2.67 22.05-1.244 15.525.362 9.105 1.962 2.67 8.471-1.24 14.912.364c6.417 1.594 10.334 8.119 8.726 14.54zm-6.72-6.38c.313-2.09-1.282-3.217-3.462-3.962l.708-2.84-1.728-.43-.69 2.766c-.454-.114-.92-.22-1.385-.326l.695-2.783L9.33 1.498l-.708 2.84c-.376-.086-.746-.17-1.104-.26L5.794 5.2l.432 1.72.682-.17c.373-.092.556.02.54.218l-.544 2.19c.03.01.076.024.12.043l-.122-.03-.765 3.07c-.046.113-.16.282-.418.216l.011.045-.684.173.232.923c.321.08.636.164.945.242l-.715 2.863 1.727.432.708-2.84c.472.13.93.253 1.378.37l-.693 2.782 1.73.43.714-2.868c2.947.558 5.16.333 6.095-2.333.754-2.146-.037-3.384-1.585-4.192 1.13-.26 1.98-1.002 2.207-2.536zm-3.95 5.538c-.534 2.147-4.148.987-5.32.695l.95-3.81c1.17.293 4.929.873 4.37 3.115zm.535-5.567c-.487 1.953-3.495.962-4.47.72l.862-3.456c.974.243 4.118.696 3.608 2.736z"/>
                                        </svg>
                                    )}
                                    {method.id === "more" && (
                                        <span>...</span>
                                    )}
                                </div>
                                <span>{method.label}</span>
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
                    {isLoading ? "Processing..." : "Add Funds"}
                </button>
            </div>
        </div>
    );
}
