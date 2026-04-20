// Application entry point — this is the first file Vite executes in the browser.
// It mounts the React component tree onto the single <div id="root"> in index.html.

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";       // root router that contains all pages and shared providers
import "./index.css";          // base CSS loaded before any component renders to avoid flash of unstyled content

ReactDOM.createRoot(
  // the non-null assertion (!) tells TypeScript that #root is guaranteed to exist in index.html —
  // if it is ever missing, React will throw immediately with a clear error rather than silently failing
  document.getElementById("root")!
).render(
  // StrictMode enables additional runtime checks and warnings during development only —
  // it intentionally renders components twice to help surface side-effects in effects and state,
  // and has no impact on the production build
  <React.StrictMode>
    <App />
  </React.StrictMode>
);