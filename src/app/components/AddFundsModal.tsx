"use client";

import React, { useState } from "react";
import styles from "./addFundsModal.module.css";
import { FaBitcoin } from "react-icons/fa";

interface AddFundsModalProps {
    onClose: () => void;
}

const PACKAGES = [
    { id: "pkg_50", price: 50, badge: null },
    { id: "pkg_500", price: 500, badge: "SAVE 5%" },
    { id: "pkg_1250", price: 1250, badge: "SAVE 10%" },
];

export default function AddFundsModal({ onClose }: AddFundsModalProps) {
    const [selectedPackage, setSelectedPackage] = useState(PACKAGES[0].id);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");

    const handleBuy = async () => {
        setIsLoading(true);
        setError("");

        const pkg = PACKAGES.find(p => p.id === selectedPackage);
        if (!pkg) return;

        try {
            const res = await fetch("/api/payments/nowpayments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ amount: pkg.price, packageId: pkg.id }),
            });

            const data = await res.json();

            if (data.success && data.invoiceUrl) {
                window.location.href = data.invoiceUrl;
            } else {
                setError(data.message || "Failed to create payment invoice.");
            }
        } catch {
            setError("Something went wrong. Please try again.");
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
                    <div className={`${styles.paymentMethod} ${styles.selected}`}>
                        <div className={styles.paymentIcon}>
                            <FaBitcoin size={26} />
                        </div>
                        <span>Crypto</span>
                    </div>
                </div>

                {error && (
                    <div style={{ color: "#ef4444", marginBottom: "16px", fontSize: "14px", textAlign: "center" }}>
                        {error}
                    </div>
                )}

                <button
                    className={styles.buyButton}
                    onClick={handleBuy}
                    disabled={isLoading}
                >
                    {isLoading ? "Processing..." : "Pay with Crypto"}
                </button>
            </div>
        </div>
    );
}
