"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";

export default function MixpanelIdentify() {
  const { data: session, status } = useSession();

  useEffect(() => {
    const mp = (window as any).mixpanel;
    if (!mp) return;

    if (status === "authenticated" && session?.user) {
      const user = session.user as any;
      mp.identify(user.id);
      mp.people.set({
        $email: user.email,
        $name: user.name,
      });
    } else if (status === "unauthenticated") {
      mp.reset();
    }
  }, [status, session]);

  return null;
}
