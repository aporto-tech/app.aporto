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

// Aporto is 30% cheaper than official API prices.
// So $1 deposited = $1 / 0.70 ≈ $1.43 of official API usage.
const officialValue = (deposit: number) => deposit / 0.7;
const savings = (deposit: number) => officialValue(deposit) - deposit;

export default function AddFundsModal({ onClose }: AddFundsModalProps) {
    const [selectedPackage, setSelectedPackage] = useState<string | null>(PACKAGES[0].id);
    const [customAmount, setCustomAmount] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");

    // Active amount: custom input wins if non-empty and valid
    const customNum = parseFloat(customAmount);
    const isCustomActive = customAmount !== "" && !isNaN(customNum) && customNum > 0;
    const activeAmount = isCustomActive
        ? customNum
        : PACKAGES.find(p => p.id === selectedPackage)?.price ?? 0;

    const handleSelectPackage = (id: string) => {
        setSelectedPackage(id);
        setCustomAmount("");
    };

    const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setCustomAmount(e.target.value);
        setSelectedPackage(null);
    };

    const handleBuy = async () => {
        if (activeAmount <= 0) {
            setError("Please select a package or enter an amount.");
            return;
        }
        setIsLoading(true);
        setError("");

        const packageId = isCustomActive ? `custom_${activeAmount}` : (selectedPackage ?? "custom");

        try {
            const res = await fetch("/api/payments/nowpayments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ amount: activeAmount, packageId }),
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
                            className={`${styles.packageCard} ${selectedPackage === pkg.id && !isCustomActive ? styles.selected : ""}`}
                            onClick={() => handleSelectPackage(pkg.id)}
                        >
                            {pkg.badge && (
                                <div className={styles.saveBadge}>{pkg.badge}</div>
                            )}
                            <div className={styles.price}>${pkg.price}</div>
                        </div>
                    ))}
                </div>

                <div className={styles.sectionTitle}>Or enter custom amount</div>
                <div className={styles.customAmountRow}>
                    <span className={styles.currencyPrefix}>$</span>
                    <input
                        type="number"
                        min="1"
                        step="1"
                        placeholder="e.g. 200"
                        value={customAmount}
                        onChange={handleCustomChange}
                        className={`${styles.customInput} ${isCustomActive ? styles.customInputActive : ""}`}
                    />
                </div>

                {/* Live savings callout */}
                {activeAmount > 0 && (
                    <div className={styles.savingsCallout}>
                        <span className={styles.savingsLabel}>You get</span>
                        <span className={styles.savingsValue}>${officialValue(activeAmount).toFixed(2)}</span>
                        <span className={styles.savingsLabel}>worth of official API usage</span>
                        <span className={styles.savingsPill}>Save ${savings(activeAmount).toFixed(2)}</span>
                        <span className={styles.savingsSubtext}>30% off official LLM prices</span>
                    </div>
                )}

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
                    disabled={isLoading || activeAmount <= 0}
                >
                    {isLoading ? "Processing..." : `Pay $${activeAmount > 0 ? activeAmount.toFixed(2) : "0.00"} with Crypto`}
                </button>
            </div>
        </div>
    );
}
