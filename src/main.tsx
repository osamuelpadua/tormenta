import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/cinzel/wght.css";
import "@fontsource-variable/source-sans-3/wght.css";
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
