import { QueryClient } from "@tanstack/react-query";

// A single client holds all server state so navigating between pages reuses
// cached data instead of refetching from empty — the cached value renders
// immediately (no skeleton, no layout shift) while a background revalidation
// keeps it fresh. Correctness across pages comes from mutations invalidating
// the relevant query keys, not from a short staleTime.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Treat data as fresh for 30s: revisits within the window skip the
      // network entirely, longer gaps trigger a silent background refetch.
      staleTime: 30_000,
      // Keep unused data cached for 5 min so quick back-and-forth navigation
      // stays instant before the cache is garbage-collected.
      gcTime: 5 * 60_000,
      // Revalidate when the user tabs back in — the moment they look, it's current.
      refetchOnWindowFocus: true,
      retry: 1
    }
  }
});
