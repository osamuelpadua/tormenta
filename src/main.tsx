import React from "react";
import ReactDOM from "react-dom/client";
import App, { ErrorBoundary } from "./App";
import { db } from "./storage/database";

// Complete the initial character setup before the UI reads the local database.
db.on("ready", () => db.initializeExampleCharacter());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
