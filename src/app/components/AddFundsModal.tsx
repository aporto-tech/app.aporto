"use client";

import React, { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import styles from "./addFundsModal.module.css";
import { FaBitcoin, FaCreditCard } from "react-icons/fa";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "");

interface AddFundsModalProps {
    onClose: () => void;
}

const PACKAGES = [
    { id: "pkg_50", price: 50 },
    { id: "pkg_500", price: 500 },
    { id: "pkg_1250", price: 1250 },
];

const STRIPE_MIN = 5;

const officialValue = (deposit: number) => deposit / 0.7;
const savings = (deposit: number) => officialValue(deposit) - deposit;
const officialValueAfterCardFee = (deposit: number) => {
    const net = deposit * (1 - 0.029) - 0.30;
    return net > 0 ? officialValue(net) : 0;
};

type PaymentMethod = "crypto" | "card" | "saved_card";

interface SavedCardInfo {
    brand: string;
    last4: string;
    expiry: string;
}

export default function AddFundsModal({ onClose }: AddFundsModalProps) {
    const [selectedPackage, setSelectedPackage] = useState<string | null>(PACKAGES[0].id);
    const [customAmount, setCustomAmount] = useState("");
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("crypto");
    const [isLoadingCrypto, setIsLoadingCrypto] = useState(false);
    const [isLoadingCard, setIsLoadingCard] = useState(false);
    const [isLoadingSavedCard, setIsLoadingSavedCard] = useState(false);
    const [errorCrypto, setErrorCrypto] = useState("");
    const [errorCard, setErrorCard] = useState("");
    const [errorSavedCard, setErrorSavedCard] = useState("");
    const [savedCard, setSavedCard] = useState<SavedCardInfo | null>(null);
    const [savedCardLoading, setSavedCardLoading] = useState(true);
    const [successMessage, setSuccessMessage] = useState("");

    // Track modal open
    useEffect(() => {
        const mp = (window as any).mixpanel;
        if (mp) mp.track("add_funds_modal_opened");
    }, []);

    useEffect(() => {
        fetch("/api/payments/stripe/saved-method")
            .then(r => r.json())
            .then(d => {
                if (d.success && d.hasSavedCard) {
                    setSavedCard({ brand: d.brand, last4: d.last4, expiry: d.expiry });
                }
            })
            .catch(() => {})
            .finally(() => setSavedCardLoading(false));
    }, []);

    const customNum = parseFloat(customAmount);
    const isCustomActive = customAmount !== "" && !isNaN(customNum) && customNum > 0;
    const activeAmount = isCustomActive
        ? customNum
        : PACKAGES.find(p => p.id === selectedPackage)?.price ?? 0;

    const isLoading = paymentMethod === "crypto" ? isLoadingCrypto
        : paymentMethod === "card" ? isLoadingCard
        : isLoadingSavedCard;
    const error = paymentMethod === "crypto" ? errorCrypto
        : paymentMethod === "card" ? errorCard
        : errorSavedCard;
    const cardMinError = (paymentMethod === "card" || paymentMethod === "saved_card") && activeAmount > 0 && activeAmount < STRIPE_MIN
        ? `Minimum $${STRIPE_MIN} for card payments`
        : "";

    const handleSelectPackage = (id: string) => {
        setSelectedPackage(id);
        setCustomAmount("");
        setErrorCrypto("");
        setErrorCard("");
        setErrorSavedCard("");
    };

    const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setCustomAmount(e.target.value);
        setSelectedPackage(null);
        setErrorCrypto("");
        setErrorCard("");
        setErrorSavedCard("");
    };

    const handleSelectMethod = (method: PaymentMethod) => {
        setPaymentMethod(method);
        setErrorCrypto("");
        setErrorCard("");
        setErrorSavedCard("");
    };

    const handleBuy = async () => {
        if (activeAmount <= 0) {
            const msg = "Please select a package or enter an amount.";
            if (paymentMethod === "crypto") setErrorCrypto(msg);
            else if (paymentMethod === "card") setErrorCard(msg);
            else setErrorSavedCard(msg);
            return;
        }
        if ((paymentMethod === "card" || paymentMethod === "saved_card") && activeAmount < STRIPE_MIN) {
            const msg = `Minimum $${STRIPE_MIN} for card payments.`;
            if (paymentMethod === "card") setErrorCard(msg);
            else setErrorSavedCard(msg);
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
                    const mp = (window as any).mixpanel;
                    if (mp) mp.track("payment_initiated", { method: "crypto", amount_usd: activeAmount, package_id: packageId });
                    window.location.href = data.invoiceUrl;
                } else {
                    setErrorCrypto(data.message || "Failed to create payment invoice.");
                }
            } catch {
                setErrorCrypto("Something went wrong. Please try again.");
            } finally {
                setIsLoadingCrypto(false);
            }
        } else if (paymentMethod === "card") {
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
                    const mp = (window as any).mixpanel;
                    if (mp) mp.track("payment_initiated", { method: "card", amount_usd: activeAmount, package_id: packageId });
                    window.location.href = data.checkoutUrl;
                } else {
                    setErrorCard(data.message || "Failed to create card payment session.");
                }
            } catch {
                setErrorCard("Something went wrong. Please try again.");
            } finally {
                setIsLoadingCard(false);
            }
        } else {
            // Saved card: one-click charge via PaymentIntent
            setIsLoadingSavedCard(true);
            setErrorSavedCard("");
            try {
                const stripe = await stripePromise;
                if (!stripe) {
                    setErrorSavedCard("Stripe not loaded. Please refresh and try again.");
                    return;
                }

                // Step 1: create PaymentIntent on server
                const ciRes = await fetch("/api/payments/stripe/charge-saved", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ amount: activeAmount }),
                });
                const ciData = await ciRes.json();
                if (!ciData.success || !ciData.clientSecret) {
                    setErrorSavedCard(ciData.message || "Failed to initiate payment.");
                    return;
                }

                // Step 2: confirm on client (handles 3DS if needed)
                const { paymentIntent, error: stripeError } = await stripe.confirmCardPayment(ciData.clientSecret);
                if (stripeError) {
                    setErrorSavedCard(stripeError.message ?? "Payment failed.");
                    return;
                }

                if (paymentIntent?.status !== "succeeded") {
                    setErrorSavedCard(`Payment not completed. Status: ${paymentIntent?.status}`);
                    return;
                }

                // Step 3: confirm on server → credit quota
                const confirmRes = await fetch("/api/payments/stripe/charge-saved/confirm", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ paymentIntentId: paymentIntent.id }),
                });
                const confirmData = await confirmRes.json();
                if (!confirmData.success) {
                    setErrorSavedCard(confirmData.message || "Payment succeeded but quota not credited. Contact support.");
                    return;
                }

                setSuccessMessage(`+$${officialValueAfterCardFee(activeAmount).toFixed(2)} in API credits added to your balance!`);
                const mp = (window as any).mixpanel;
                if (mp) mp.track("payment_initiated", { method: "saved_card", amount_usd: activeAmount });
            } catch {
                setErrorSavedCard("Something went wrong. Please try again.");
            } finally {
                setIsLoadingSavedCard(false);
            }
        }
    };

    const buttonLabel = () => {
        if (successMessage) return successMessage;
        if (activeAmount <= 0) return "Select an amount";
        if (paymentMethod === "crypto") {
            return isLoadingCrypto ? "Processing..." : `Pay $${activeAmount.toFixed(2)} with Crypto`;
        }
        if (paymentMethod === "card") {
            return isLoadingCard ? "Processing..." : `Pay $${activeAmount.toFixed(2)} with Card`;
        }
        // saved_card
        if (isLoadingSavedCard) return "Processing...";
        const brand = savedCard?.brand ? savedCard.brand.charAt(0).toUpperCase() + savedCard.brand.slice(1) : "Card";
        return `Pay $${activeAmount.toFixed(2)} · ${brand} ••••${savedCard?.last4}`;
    };

    const savedCardLabel = savedCard
        ? `${savedCard.brand.charAt(0).toUpperCase() + savedCard.brand.slice(1)} ••••${savedCard.last4}`
        : "Saved Card";

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
                        min={(paymentMethod === "card" || paymentMethod === "saved_card") ? STRIPE_MIN : 1}
                        step="1"
                        placeholder="e.g. 200"
                        value={customAmount}
                        onChange={handleCustomChange}
                        className={`${styles.customInput} ${isCustomActive ? styles.customInputActive : ""}`}
                    />
                </div>

                {cardMinError && (
                    <div style={{ color: "#ef4444", marginBottom: "12px", fontSize: "13px" }}>
                        {cardMinError}
                    </div>
                )}

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
                        <span>New Card</span>
                        <span style={{ fontSize: "11px", color: paymentMethod === "card" ? "#00dc82" : "#52525b" }}>
                            +2.9% card fee
                        </span>
                    </div>
                    {!savedCardLoading && savedCard && (
                        <div
                            className={`${styles.paymentMethod} ${paymentMethod === "saved_card" ? styles.selected : ""}`}
                            onClick={() => handleSelectMethod("saved_card")}
                        >
                            <div className={styles.paymentIcon}>
                                <FaCreditCard size={26} />
                            </div>
                            <span>{savedCardLabel}</span>
                            <span style={{ fontSize: "11px", color: paymentMethod === "saved_card" ? "#00dc82" : "#52525b" }}>
                                One-click
                            </span>
                        </div>
                    )}
                </div>

                {activeAmount > 0 && !cardMinError && !successMessage && (
                    <div className={styles.savingsCallout}>
                        <span className={styles.savingsLabel}>You get</span>
                        <span className={styles.savingsValue}>
                            {(paymentMethod === "card" || paymentMethod === "saved_card")
                                ? `$${officialValueAfterCardFee(activeAmount).toFixed(2)}`
                                : `$${officialValue(activeAmount).toFixed(2)}`}
                        </span>
                        <span className={styles.savingsLabel}>worth of official API usage</span>
                        {paymentMethod === "crypto" && (
                            <span className={styles.savingsPill}>Save ${savings(activeAmount).toFixed(2)}</span>
                        )}
                        <span className={styles.savingsSubtext}>
                            {(paymentMethod === "card" || paymentMethod === "saved_card")
                                ? "30% off official LLM prices (after 2.9% card processing fee)"
                                : "30% off official LLM prices"}
                        </span>
                    </div>
                )}

                {successMessage && (
                    <div style={{
                        background: "rgba(0,220,130,0.1)",
                        border: "1px solid rgba(0,220,130,0.3)",
                        borderRadius: "10px",
                        padding: "16px",
                        marginBottom: "16px",
                        color: "#00dc82",
                        textAlign: "center",
                        fontWeight: 600,
                    }}>
                        {successMessage}
                    </div>
                )}

                {error && (
                    <div style={{ color: "#ef4444", marginBottom: "16px", fontSize: "14px", textAlign: "center" }}>
                        {error}
                    </div>
                )}

                {successMessage ? (
                    <button className={styles.buyButton} onClick={onClose}>Close</button>
                ) : (
                    <button
                        className={styles.buyButton}
                        onClick={handleBuy}
                        disabled={isLoading || activeAmount <= 0 || !!cardMinError}
                    >
                        {buttonLabel()}
                    </button>
                )}
            </div>
        </div>
    );
}

