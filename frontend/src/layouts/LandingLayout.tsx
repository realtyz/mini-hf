import { Outlet, useLocation } from "react-router";
import { Header } from "@/pages/components/Header";
import { Footer } from "@/pages/components/Footer";
import { AnnouncementBanner } from "@/pages/components/AnnouncementBanner";
import { useState } from "react";

export function LandingLayout() {
  const location = useLocation();
  const isDocs = location.pathname.startsWith("/docs");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col">
      <AnnouncementBanner />
      <Header
        variant={isDocs ? "docs" : "landing"}
        onMenuClick={isDocs ? () => setSidebarOpen(!sidebarOpen) : undefined}
        isMenuOpen={isDocs ? sidebarOpen : undefined}
      />
      <div className="flex flex-1 flex-col">
        <Outlet context={{ sidebarOpen, setSidebarOpen }} />
        {!isDocs && <Footer />}
      </div>
    </div>
  );
}

export default LandingLayout;
