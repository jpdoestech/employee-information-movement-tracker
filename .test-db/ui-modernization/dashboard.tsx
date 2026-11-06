// Isolated synthetic preview of the integrated interface; never loaded in production.
import { createRoot } from "react-dom/client";
import App from "../../src/App";
import { enableDemo } from "../../src/api";
import { TransactionConfirmation } from "../../src/components/TransactionConfirmation";
import { TransactionProgress } from "../../src/components/TransactionProgress";
import "../../src/styles.css";
import "../../src/appearance.css";

enableDemo();
window.trackerAppearance.setTheme(
  new URLSearchParams(location.search).get("theme") || "light",
);
createRoot(document.getElementById("root")!).render(
  <>
    <App />
    <TransactionConfirmation />
    <TransactionProgress />
  </>,
);
