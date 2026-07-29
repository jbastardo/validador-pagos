import { QueryClient, QueryFunction } from "@tanstack/react-query";

// API base URL strategy:
// - localhost          → "" (Vite proxies /api/* to Express)
// - pplx.app / perplexity.ai → "/port/5000" prefix (Perplexity proxy)
// - any other domain (Railway, custom domain) → "" (Express serves frontend + API on same origin)
function getApiBase(): string {
  if (typeof window === "undefined" || window.location.hostname === "localhost") return "";
  const host = window.location.hostname;
  if (host.endsWith("pplx.app") || host.endsWith("perplexity.ai")) {
    const base = window.location.pathname.replace(/\/[^/]*$/, "");
    return base + "/port/5000";
  }
  // Railway / custom domain: Express serves everything on the same origin
  return "";
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
  isFormData?: boolean,
): Promise<Response> {
  let headers: Record<string, string> = {};
  let body: BodyInit | undefined;

  if (data !== undefined) {
    if (isFormData && data instanceof FormData) {
      // No poner Content-Type — el browser lo agrega con el boundary correcto
      body = data as FormData;
    } else {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(data);
    }
  }

  const res = await fetch(`${API_BASE}${url}`, { method, headers, body });
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
