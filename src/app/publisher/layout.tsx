import DashboardLayout from "@/app/components/DashboardLayout";
import { ReactNode } from "react";

export default function PublisherLayout({ children }: { children: ReactNode }) {
    return <DashboardLayout>{children}</DashboardLayout>;
}
