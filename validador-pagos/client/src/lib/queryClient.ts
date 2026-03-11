import { QueryClient, QueryFunction } from "@tanstack/react-query";

// In development: use relative URLs (Vite proxies /api/* to Express on port 5000)
// In production (deployed on pplx.app): dynamically build the proxy path
// The proxy routes <page-prefix>/port/5000/api/* → Express on port 5000
function getApiBase(): string {
  // If running locally (localhost), use relative paths — Vite handles the proxy
  if (typeof window === "undefined" || window.location.hostname === "localhost") return "";
  // In production the page URL ends with /dist/public/index.html or similar
  // We need to replace the filename with port/5000
  const base = window.location.pathname.replace(/\/[^/]*$/, ""); // strip filename
  return base + "/port/5000";
}

const API_BASE = getApiBase();

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
  });
  // Return response WITHOUT throwing — callers handle errors themselves
  // (throwIfResNotOk is kept for the default queryFn below)
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(`${API_BASE}${queryKey.join("/")}`);

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
