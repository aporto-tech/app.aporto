"use client";

import React, { useEffect, useState, useCallback } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "");

const CARD_ELEMENT_OPTIONS = {
    style: {
        base: {
            color: "#ffffff",
            fontFamily: "system-ui, sans-serif",
            fontSize: "16px",
            "::placeholder": { color: "#52525b" },
            backgroundColor: "transparent",
        },
        invalid: { color: "#ef4444" },
    },
};

interface SavedCard {
    brand: string;
    last4: string;
    expiry: string;
}

function CardForm({ onSaved }: { onSaved: () => void }) {
    const stripe = useStripe();
    const elements = useElements();
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const handleSave = async () => {
        if (!stripe || !elements) return;
        setSaving(true);
        setError("");

        try {
            const res = await fetch("/api/payments/stripe/setup-intent", { method: "POST" });
            const data = await res.json();
            if (!data.success || !data.clientSecret) {
                setError(data.message || "Failed to initialize card setup.");
                return;
            }

            const cardElement = elements.getElement(CardElement);
            if (!cardElement) return;

            const { setupIntent, error: stripeError } = await stripe.confirmCardSetup(data.clientSecret, {
                payment_method: { card: cardElement },
            });

            if (stripeError) {
                setError(stripeError.message ?? "Card setup failed.");
                return;
            }

            if (setupIntent?.payment_method) {
                const saveRes = await fetch("/api/payments/stripe/save-method", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ paymentMethodId: setupIntent.payment_method }),
                });
                const saveData = await saveRes.json();
                if (!saveData.success) {
                    setError(saveData.message || "Failed to save card.");
                    return;
                }
                onSaved();
            }
        } catch {
            setError("Something went wrong. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{
                background: "#27272a",
                border: "1px solid #3f3f46",
                borderRadius: "10px",
                padding: "14px 16px",
            }}>
                <CardElement options={CARD_ELEMENT_OPTIONS} />
            </div>
            {error && (
                <div style={{ color: "#ef4444", fontSize: "13px" }}>{error}</div>
            )}
            <button
                onClick={handleSave}
                disabled={saving || !stripe}
                style={{
                    background: saving ? "#3f3f46" : "#00dc82",
                    color: saving ? "#888" : "#000",
                    border: "none",
                    borderRadius: "10px",
                    padding: "14px 24px",
                    fontSize: "15px",
                    fontWeight: 700,
                    cursor: saving ? "not-allowed" : "pointer",
                    transition: "all 0.2s",
                }}
            >
                {saving ? "Saving..." : "Save Card"}
            </button>
        </div>
    );
}

export default function SavedCardSection() {
    const [savedCard, setSavedCard] = useState<SavedCard | null>(null);
    const [hasSavedCard, setHasSavedCard] = useState(false);
    const [loading, setLoading] = useState(true);
    const [removing, setRemoving] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [removeError, setRemoveError] = useState("");

    const fetchSavedCard = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/payments/stripe/saved-method");
            const data = await res.json();
            if (data.success && data.hasSavedCard) {
                setHasSavedCard(true);
                setSavedCard({ brand: data.brand, last4: data.last4, expiry: data.expiry });
                setShowForm(false);
            } else {
                setHasSavedCard(false);
                setSavedCard(null);
            }
        } catch {
            // silent
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchSavedCard(); }, [fetchSavedCard]);

    const handleRemove = async () => {
        if (!confirm("Remove saved card?")) return;
        setRemoving(true);
        setRemoveError("");
        try {
            const res = await fetch("/api/payments/stripe/saved-method", { method: "DELETE" });
            const data = await res.json();
            if (data.success) {
                setHasSavedCard(false);
                setSavedCard(null);
            } else {
                setRemoveError(data.message || "Failed to remove card.");
            }
        } catch {
            setRemoveError("Something went wrong.");
        } finally {
            setRemoving(false);
        }
    };

    if (loading) {
        return <div style={{ color: "#64748b", padding: "12px 0" }}>Loading...</div>;
    }

    const brandLabel = savedCard?.brand
        ? savedCard.brand.charAt(0).toUpperCase() + savedCard.brand.slice(1)
        : "Card";

    return (
        <div>
            {hasSavedCard && savedCard ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        background: "#27272a",
                        border: "1px solid #3f3f46",
                        borderRadius: "10px",
                        padding: "14px 16px",
                    }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            <span style={{ fontSize: "22px" }}>💳</span>
                            <div>
                                <div style={{ fontSize: "15px", fontWeight: 600, color: "#fff" }}>
                                    {brandLabel} •••• {savedCard.last4}
                                </div>
                                <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                                    Expires {savedCard.expiry}
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={handleRemove}
                            disabled={removing}
                            style={{
                                background: "none",
                                border: "1px solid #3f3f46",
                                borderRadius: "8px",
                                color: "#ef4444",
                                fontSize: "13px",
                                padding: "6px 14px",
                                cursor: removing ? "not-allowed" : "pointer",
                            }}
                        >
                            {removing ? "Removing..." : "Remove"}
                        </button>
                    </div>
                    {removeError && <div style={{ color: "#ef4444", fontSize: "13px" }}>{removeError}</div>}
                    <p style={{ fontSize: "13px", color: "#64748b", margin: 0 }}>
                        Use this card for instant top-ups from the Add Funds modal — no redirect needed.
                    </p>
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    {!showForm ? (
                        <div>
                            <p style={{ color: "#a1a1aa", fontSize: "14px", marginBottom: "16px" }}>
                                Save a card to enable instant one-click top-ups without being redirected to Stripe.
                            </p>
                            <button
                                onClick={() => setShowForm(true)}
                                style={{
                                    background: "#00dc82",
                                    color: "#000",
                                    border: "none",
                                    borderRadius: "10px",
                                    padding: "12px 24px",
                                    fontSize: "15px",
                                    fontWeight: 700,
                                    cursor: "pointer",
                                }}
                            >
                                + Add Card
                            </button>
                        </div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <span style={{ fontSize: "14px", color: "#a1a1aa" }}>Enter card details</span>
                                <button
                                    onClick={() => setShowForm(false)}
                                    style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "18px" }}
                                >
                                    ✕
                                </button>
                            </div>
                            <Elements stripe={stripePromise}>
                                <CardForm onSaved={fetchSavedCard} />
                            </Elements>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
