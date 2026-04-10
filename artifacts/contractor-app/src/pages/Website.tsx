import { useState, useEffect } from "react";
import { Globe, Images, Inbox } from "lucide-react";
import { PortfolioTab } from "./Portfolio";
import { InquiriesTab } from "./Inquiries";
import { WebsiteServicesTab } from "./PublicServices";

type Tab = "portfolio" | "inquiries" | "services";

const VALID_TABS: Tab[] = ["portfolio", "inquiries", "services"];

const TABS: { id: Tab; label: string; icon: typeof Globe }[] = [
  { id: "portfolio", label: "Portfolio", icon: Images },
  { id: "inquiries", label: "Inquiries", icon: Inbox },
  { id: "services", label: "Services", icon: Globe },
];

function hashToTab(hash: string): Tab {
  const val = hash.replace("#", "");
  return VALID_TABS.includes(val as Tab) ? (val as Tab) : "portfolio";
}

export default function Website() {
  const [activeTab, setActiveTab] = useState<Tab>(() => hashToTab(window.location.hash));

  useEffect(() => {
    function onHashChange() {
      setActiveTab(hashToTab(window.location.hash));
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  function switchTab(tab: Tab) {
    window.location.hash = tab;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Globe className="w-6 h-6 text-primary" /> Website
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your public website — portfolio, inquiries, and listed services.
        </p>
      </div>

      <div className="flex gap-1 p-1 bg-muted rounded-xl w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => switchTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === "portfolio" && <PortfolioTab />}
      {activeTab === "inquiries" && <InquiriesTab />}
      {activeTab === "services" && <WebsiteServicesTab />}
    </div>
  );
}
