"use client";

import { useEffect, useState } from "react";
import styles from "./helloBar.module.css";

type Announcement = {
    id: string;
    text: string;
    href: string | null;
    backgroundColor: string;
    textColor: string;
};

export default function HelloBar({ endpoint = "/api/hello-bar" }: { endpoint?: string }) {
    const [items, setItems] = useState<Announcement[]>([]);
    const [index, setIndex] = useState(0);

    useEffect(() => {
        let cancelled = false;
        fetch(endpoint, { cache: "no-store" })
            .then((res) => res.json())
            .then((data) => {
                if (!cancelled && data?.success && Array.isArray(data.announcements)) {
                    setItems(data.announcements);
                }
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [endpoint]);

    useEffect(() => {
        if (items.length < 2) return;
        const timer = window.setInterval(() => {
            setIndex((current) => (current + 1) % items.length);
        }, 5200);
        return () => window.clearInterval(timer);
    }, [items.length]);

    if (items.length === 0) return null;

    const active = items[index % items.length];
    const content = (
        <span key={active.id} className={styles.message}>
            <span className={styles.text}>{active.text}</span>
            {active.href && <span className={styles.cta}>Learn more</span>}
        </span>
    );

    return (
        <div
            className={styles.bar}
            style={{ backgroundColor: active.backgroundColor, color: active.textColor }}
        >
            {active.href ? (
                <a className={styles.link} href={active.href}>
                    {content}
                </a>
            ) : (
                <div className={styles.link}>{content}</div>
            )}
        </div>
    );
}
