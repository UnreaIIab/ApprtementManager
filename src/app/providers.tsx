"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { AuthProvider } from "@/hooks/use-auth";
import { DateFilterProvider } from "@/hooks/use-date-filter";
import { WorkspaceProvider } from "@/hooks/use-workspace";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
        // Keeps the previous data on screen while a refetch runs, so tables and
        // charts fade rather than collapsing into a skeleton.
        placeholderData: <T,>(previous: T) => previous,
      },
      mutations: { retry: 0 },
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  // Created once per mount so a Fast Refresh doesn't discard the cache.
  const [queryClient] = useState(makeQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <AuthProvider>
          <WorkspaceProvider>
            <DateFilterProvider>
              {children}
            <Toaster
              position="bottom-right"
              closeButton
              toastOptions={{
                className: "!rounded-xl !border-line !bg-surface !text-ink !shadow-lg",
              }}
            />
            </DateFilterProvider>
          </WorkspaceProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
