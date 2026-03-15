"use client";

import React, { useEffect, useRef, useState } from "react";
import styles from "./layout.module.css";

const Header = () => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const email = "user@example.com";
    const name = "User Name";

    return (
        <header className={styles.header}>
            <div ref={ref} className={styles.userMenuWrapper}>
                <button
                    className={styles.userProfile}
                    onClick={() => setOpen((prev) => !prev)}
                    aria-haspopup="true"
                    aria-expanded={open}
                >
                    <span className={styles.userEmail}>{email}</span>
                    <span
                        className={styles.chevron}
                        style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
                    >
                        ▼
                    </span>
                </button>

                <div className={`${styles.userDropdown} ${open ? styles.userDropdownOpen : ""}`}>
                    <div className={styles.dropdownUser}>
                        <div className={styles.dropdownEmail}>{email}</div>
                        <div className={styles.dropdownName}>{name}</div>
                    </div>
                    <div className={styles.dropdownDivider} />
                    <button className={styles.dropdownItem} onClick={() => console.log("Logout clicked")}>
                        Logout
                    </button>
                </div>
            </div>
        </header>
    );
};

export default Header;
