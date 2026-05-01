"use client";

import React, { useEffect, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import styles from "./layout.module.css";

const Header = () => {
    const { data: session } = useSession();
    const pathname = usePathname();
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
    const isPublisherSection = pathname.startsWith("/publisher");

    return (
        <header className={styles.header}>
            {/* Context button */}
            {isPublisherSection ? (
                <Link href="/dashboard" className={styles.headerCtaSecondary}>
                    Dashboard
                </Link>
            ) : (
                <Link href="/publisher/skills/new" className={styles.headerCta}>
                    + Add Skill
                </Link>
            )}

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
