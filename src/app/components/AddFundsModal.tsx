"use client";

import React, { useState } from "react";
import styles from "./addFundsModal.module.css";
import { FaBitcoin, FaCreditCard } from "react-icons/fa";

interface AddFundsModalProps {
    onClose: () => void;
}

const PACKAGES = [
    { id: "pkg_50", price: 50 },
    { id: "pkg_500", price: 500 },
    { id: "pkg_1250", price: 1250 },
];

const STRIPE_MIN = 5; // $5 minimum for card (Stripe fee: 2.9% + $0.30 makes sub-$5 economically negative)

// Aporto is 30% cheaper than official API prices.
// So $1 deposited = $1 / 0.70 ≈ $1.43 of official API usage.
const officialValue = (deposit: number) => deposit / 0.7;
const savings = (deposit: number) => officialValue(deposit) - deposit;
// Net value after Stripe's 2.9% + $0.30 fee
const officialValueAfterCardFee = (deposit: number) => {
    const net = deposit * (1 - 0.029) - 0.30;
    return net > 0 ? officialValue(net) : 0;
};

type PaymentMethod = "crypto" | "card";

export default function AddFundsModal({ onClose }: AddFundsModalProps) {
    const [selectedPackage, setSelectedPackage] = useState<string | null>(PACKAGES[0].id);
    const [customAmount, setCustomAmount] = useState("");
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("crypto");
    const [isLoadingCrypto, setIsLoadingCrypto] = useState(false);
    const [isLoadingCard, setIsLoadingCard] = useState(false);
    const [errorCrypto, setErrorCrypto] = useState("");
    const [errorCard, setErrorCard] = useState("");

    // Active amount: custom input wins if non-empty and valid
    const customNum = parseFloat(customAmount);
    const isCustomActive = customAmount !== "" && !isNaN(customNum) && customNum > 0;
    const activeAmount = isCustomActive
        ? customNum
        : PACKAGES.find(p => p.id === selectedPackage)?.price ?? 0;

    const isLoading = paymentMethod === "crypto" ? isLoadingCrypto : isLoadingCard;
    const error = paymentMethod === "crypto" ? errorCrypto : errorCard;
    const cardMinError = paymentMethod === "card" && activeAmount > 0 && activeAmount < STRIPE_MIN
        ? `Minimum $${STRIPE_MIN} for card payments`
        : "";

    const handleSelectPackage = (id: string) => {
        setSelectedPackage(id);
        setCustomAmount("");
        setErrorCrypto("");
        setErrorCard("");
    };

    const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setCustomAmount(e.target.value);
        setSelectedPackage(null);
        setErrorCrypto("");
        setErrorCard("");
    };

    const handleSelectMethod = (method: PaymentMethod) => {
        setPaymentMethod(method);
        setErrorCrypto("");
        setErrorCard("");
    };

    const handleBuy = async () => {
        if (activeAmount <= 0) {
            if (paymentMethod === "crypto") setErrorCrypto("Please select a package or enter an amount.");
            else setErrorCard("Please select a package or enter an amount.");
            return;
        }
        if (paymentMethod === "card" && activeAmount < STRIPE_MIN) {
            setErrorCard(`Minimum $${STRIPE_MIN} for card payments.`);
            return;
        }

        const packageId = isCustomActive ? `custom_${activeAmount}` : (selectedPackage ?? "custom");

        if (paymentMethod === "crypto") {
            setIsLoadingCrypto(true);
            setErrorCrypto("");
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
                    setErrorCrypto(data.message || "Failed to create payment invoice.");
                }
            } catch {
                setErrorCrypto("Something went wrong. Please try again.");
            } finally {
                setIsLoadingCrypto(false);
            }
        } else {
            setIsLoadingCard(true);
            setErrorCard("");
            try {
                const res = await fetch("/api/payments/stripe", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ amount: activeAmount, packageId }),
                });
                const data = await res.json();
                if (data.success && data.checkoutUrl) {
                    window.location.href = data.checkoutUrl;
                } else {
                    setErrorCard(data.message || "Failed to create card payment session.");
                }
            } catch {
                setErrorCard("Something went wrong. Please try again.");
            } finally {
                setIsLoadingCard(false);
            }
        }
    };

    const buttonLabel = () => {
        if (activeAmount <= 0) return "Select an amount";
        if (paymentMethod === "crypto") {
            return isLoadingCrypto ? "Processing..." : `Pay $${activeAmount.toFixed(2)} with Crypto`;
        }
        return isLoadingCard ? "Processing..." : `Pay $${activeAmount.toFixed(2)} with Card`;
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
                            <div className={styles.saveBadge}>+${savings(pkg.price).toFixed(0)} value</div>
                            <div className={styles.price}>${pkg.price}</div>
                        </div>
                    ))}
                </div>

                <div className={styles.sectionTitle}>Or enter custom amount</div>
                <div className={styles.customAmountRow}>
                    <span className={styles.currencyPrefix}>$</span>
                    <input
                        type="number"
                        min={paymentMethod === "card" ? STRIPE_MIN : 1}
                        step="1"
                        placeholder="e.g. 200"
                        value={customAmount}
                        onChange={handleCustomChange}
                        className={`${styles.customInput} ${isCustomActive ? styles.customInputActive : ""}`}
                    />
                </div>

                {/* Card minimum inline warning — near amount field, not near button */}
                {cardMinError && (
                    <div style={{ color: "#ef4444", marginBottom: "12px", fontSize: "13px" }}>
                        {cardMinError}
                    </div>
                )}

                {/* Payment method selector — above savings callout so method affects the value shown */}
                <div className={styles.sectionTitle}>Payment Method</div>
                <div className={styles.paymentGrid}>
                    <div
                        className={`${styles.paymentMethod} ${paymentMethod === "crypto" ? styles.selected : ""}`}
                        onClick={() => handleSelectMethod("crypto")}
                    >
                        <div className={styles.paymentIcon}>
                            <FaBitcoin size={26} />
                        </div>
                        <span>Crypto</span>
                        <span style={{ fontSize: "11px", color: paymentMethod === "crypto" ? "#00dc82" : "#52525b" }}>
                            No extra fees
                        </span>
                    </div>
                    <div
                        className={`${styles.paymentMethod} ${paymentMethod === "card" ? styles.selected : ""}`}
                        onClick={() => handleSelectMethod("card")}
                    >
                        <div className={styles.paymentIcon}>
                            <FaCreditCard size={26} />
                        </div>
                        <span>Card</span>
                        <span style={{ fontSize: "11px", color: paymentMethod === "card" ? "#00dc82" : "#52525b" }}>
                            +2.9% card fee
                        </span>
                    </div>
                </div>

                {/* Savings callout — adjusts for card fee when card method is selected */}
                {activeAmount > 0 && !cardMinError && (
                    <div className={styles.savingsCallout}>
                        <span className={styles.savingsLabel}>You get</span>
                        <span className={styles.savingsValue}>
                            {paymentMethod === "card"
                                ? `$${officialValueAfterCardFee(activeAmount).toFixed(2)}`
                                : `$${officialValue(activeAmount).toFixed(2)}`}
                        </span>
                        <span className={styles.savingsLabel}>worth of official API usage</span>
                        {paymentMethod === "crypto" && (
                            <span className={styles.savingsPill}>Save ${savings(activeAmount).toFixed(2)}</span>
                        )}
                        <span className={styles.savingsSubtext}>
                            {paymentMethod === "card"
                                ? "30% off official LLM prices (after 2.9% card processing fee)"
                                : "30% off official LLM prices"}
                        </span>
                    </div>
                )}

                {error && (
                    <div style={{ color: "#ef4444", marginBottom: "16px", fontSize: "14px", textAlign: "center" }}>
                        {error}
                    </div>
                )}

                <button
                    className={styles.buyButton}
                    onClick={handleBuy}
                    disabled={isLoading || activeAmount <= 0 || !!cardMinError}
                >
                    {buttonLabel()}
                </button>
            </div>
        </div>
    );
}
