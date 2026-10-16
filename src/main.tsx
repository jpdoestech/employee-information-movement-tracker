import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { TransactionConfirmation } from "./components/TransactionConfirmation";
import { TransactionProgress } from "./components/TransactionProgress";
import "./styles.css";
import "./appearance.css";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <TransactionConfirmation />
    <TransactionProgress />
  </StrictMode>,
);
