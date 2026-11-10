import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "../../authContext.jsx";
import UpdatesPage from "../../pages/UpdatesPage.jsx";
import AdminUpdatesPage from "../../pages/AdminUpdatesPage.jsx";
import "../../appStyles.js";

const view = new URLSearchParams(location.search).get("view");
function ReadyPage() {
  const { user, loading } = useAuth();
  if (loading || !user) return <p role="status">로그인 확인 중</p>;
  return view === "admin" ? <AdminUpdatesPage /> : <UpdatesPage />;
}

createRoot(document.getElementById("root")).render(
  <MemoryRouter initialEntries={["/updates"]}>
    <AuthProvider>
      <ReadyPage />
    </AuthProvider>
  </MemoryRouter>
);
