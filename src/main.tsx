import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/cinzel/wght.css";
import "@fontsource-variable/source-sans-3/wght.css";
import App, { ErrorBoundary } from "./App";
import { db } from "./storage/database";
import { initializeDefaultMap } from "./storage/maps";
import { engine } from "./sync/backend";

// Complete the initial character setup before the UI reads the local database.
db.on("ready", async () => {
  await db.initializeExampleCharacter();
  await initializeDefaultMap(db);
});
// Sync failures surface in the account status; local use is never blocked.
void engine?.start().catch(() => {});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
