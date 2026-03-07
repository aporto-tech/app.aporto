"use client";

import React, { useEffect, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import styles from "./layout.module.css";

const Header = () => {
    const { data: session } = useSession();
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

    const email = session?.user?.email ?? "user@example.com";
    const name = session?.user?.name ?? email;

    return (
        <header className={styles.header}>
            <div ref={ref} className={styles.userMenuWrapper}>
                {/* Trigger */}
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

                {/* Dropdown */}
                <div className={`${styles.userDropdown} ${open ? styles.userDropdownOpen : ""}`}>
                    {/* User info section */}
                    <div className={styles.dropdownUser}>
                        <div className={styles.dropdownEmail}>{email}</div>
                        {name !== email && (
                            <div className={styles.dropdownName}>{name}</div>
                        )}
                        <div className={styles.dropdownEmailSub}>{email}</div>
                    </div>

                    <div className={styles.dropdownDivider} />

                    {/* Logout */}
                    <button
                        className={styles.dropdownItem}
                        onClick={() => signOut({ callbackUrl: "/login" })}
                    >
                        Logout
                    </button>
                </div>
            </div>
        </header>
    );
};

export default Header;
