import { getApiKey } from "./auth";

interface RequestOptions extends RequestInit {
  params?: Record<string, string>;
}

interface ConfigResponse {
  apiUrl: string;
  remotePatterns: string;
}

let BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";
let initPromise: Promise<void> | null = null;

async function initializeBaseUrl() {
  try {
    const response = await fetch("/api/config");
    const config: ConfigResponse = await response.json();
    if (config.apiUrl) {
      BASE_URL = config.apiUrl;
    }
  } catch (error) {
    console.error("Failed to fetch API config:", error);
  }
}

// Ensure initialization only runs once, even with concurrent requests
async function ensureInitialized() {
  if (!initPromise) {
    initPromise = initializeBaseUrl();
  }
  await initPromise;
}

export async function request<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  await ensureInitialized();

  const apiKey = getApiKey();

  const { params, ...restOptions } = options;

  // 构建URL
  const url: URL = new URL(endpoint, BASE_URL || window.location.origin);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.append(key, value);
    }
  }

  // 添加认证头
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    ...options.headers,
  };

  const response = await fetch(url.toString(), {
    ...restOptions,
    headers,
  });

  if (!response.ok) {
    let errorMessage = "请求失败";
    try {
      const error = await response.json();
      errorMessage = error.message || error.error || errorMessage;
    } catch {
      // Response is not JSON, try to get text
      try {
        const text = await response.text();
        if (text) errorMessage = text;
      } catch {
        // Cannot parse response body
      }
    }
    throw new Error(errorMessage);
  }

  try {
    return await response.json();
  } catch {
    throw new Error("响应数据格式无效");
  }
}

// 封装常用请求方法
export const api = {
  request,
  get: <T>(endpoint: string, params?: Record<string, string>) =>
    request<T>(endpoint, { method: "GET", params }),

  post: <T>(endpoint: string, data?: Record<string, unknown>) =>
    request<T>(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }),

  put: <T>(endpoint: string, data?: Record<string, unknown>) =>
    request<T>(endpoint, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }),

  delete: <T>(endpoint: string) => request<T>(endpoint, { method: "DELETE" }),

  upload: <T>(endpoint: string, files: File[]) => {
    const formData = new FormData();
    for (const file of files) {
      formData.append("images[]", file);
    }
    return request<T>(endpoint, {
      method: "POST",
      body: formData,
    });
  },
};
