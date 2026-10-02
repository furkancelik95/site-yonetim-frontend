import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./styles/app.css";
import "./styles/extra.css";
import { ApiError } from "./api/client";
import { AuthProvider } from "./auth/AuthContext";
import { router } from "./router";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // 4xx tekrar denenmez: yetki ve bulunamadı hatası kalıcıdır.
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
});

// Geliştirmede henüz backend'de olmayan uçlar MSW ile taklit edilir (src/mocks). Kapatmak için
// .env.local → VITE_USE_MOCKS=false. Üretim derlemesine MSW girmez.
async function startMocks() {
  if (!import.meta.env.DEV || import.meta.env.VITE_USE_MOCKS === "false") return;
  const { worker } = await import("./mocks/browser");
  await worker.start({ onUnhandledRequest: "bypass", quiet: true });
}

startMocks().then(() =>
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </StrictMode>,
  ),
);
