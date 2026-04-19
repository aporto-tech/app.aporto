"use client";

import { SessionProvider } from "next-auth/react";
import MixpanelIdentify from "./MixpanelIdentify";

export default function AuthProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <SessionProvider>
            <MixpanelIdentify />
            {children}
        </SessionProvider>
    );
}
