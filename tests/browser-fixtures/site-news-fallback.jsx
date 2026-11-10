import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../authContext.jsx";
import UpdatesPage from "../../pages/UpdatesPage.jsx";
import AdminUpdatesPage from "../../pages/AdminUpdatesPage.jsx";
import "../../appStyles.js";

const view = new URLSearchParams(location.search).get("view");
createRoot(document.getElementById("root")).render(
  <MemoryRouter initialEntries={["/updates"]}>
    <AuthProvider>
      {view === "admin" ? <AdminUpdatesPage /> : <UpdatesPage />}
    </AuthProvider>
  </MemoryRouter>
);
