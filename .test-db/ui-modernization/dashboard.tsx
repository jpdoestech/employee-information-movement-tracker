// UI-00 review harness only; production entry points and authorization are unchanged.
import { createRoot } from "react-dom/client";
import { useSyncExternalStore } from "react";
import { LayoutDashboard, Users, GitBranch, Menu } from "lucide-react";
import App from "../../src/App";
import { enableDemo, query } from "../../src/api";
import type { Context } from "../../src/domain";
import { TransactionConfirmation } from "../../src/components/TransactionConfirmation";
import { TransactionProgress } from "../../src/components/TransactionProgress";
import "../../src/styles.css";
import "../../src/appearance.css";
import "./proposal.css";

enableDemo();
const proposed = !new URLSearchParams(location.search).has("baseline");
document.documentElement.classList.toggle("ui-proposal", proposed);
window.trackerAppearance.setTheme(new URLSearchParams(location.search).get("theme") || "light");
if (proposed && window.trackerAppearance.collapsed()) window.trackerAppearance.toggleSidebar();
const context = await query<Context>("context");

function existingAction(selector: string) {
  document.querySelector<HTMLButtonElement>(selector)?.click();
}
function BottomNavigation() {
  const route = useSyncExternalStore(listener => {
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, () => location.hash || "#dashboard");
  return (
    <nav className="proposal-bottom-nav" aria-label="Primary mobile navigation">
      <a href="#dashboard" aria-current={route === "#dashboard" ? "page" : undefined}><LayoutDashboard size={20} /><span>Overview</span></a>
      {context.module_permissions?.["employees.view"] !== false && <a href="#employees" aria-current={route === "#employees" ? "page" : undefined}><Users size={20} /><span>Employees</span></a>}
      {context.module_permissions?.["movements.view"] !== false && <a href="#movements" aria-current={route === "#movements" ? "page" : undefined}><GitBranch size={20} /><span>Movements</span></a>}
      <button onClick={() => existingAction(".menu-button")}><Menu size={20} /><span>More</span></button>
    </nav>
  );
}
createRoot(document.getElementById("root")!).render(
  <>
    <App />
    {proposed && <BottomNavigation />}
    <TransactionConfirmation />
    <TransactionProgress />
  </>,
);
