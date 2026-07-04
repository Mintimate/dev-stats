import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { UserPage } from "./components/UserPage";
import type { Platform } from "./lib/types";

function Root() {
  const match = window.location.pathname.match(/^\/u\/(github|cnb)\/([^/]+)\/?$/);
  if (match) {
    return <UserPage platform={match[1] as Platform} username={decodeURIComponent(match[2])} />;
  }
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <Root />,
);
