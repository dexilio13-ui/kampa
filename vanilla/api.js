export class ApiError extends Error {
  constructor(payload, status) {
    super(payload?.message || "Request failed");
    this.name = "ApiError";
    this.code = payload?.code || "UNKNOWN";
    this.hint = payload?.hint || "";
    this.retryable = Boolean(payload?.retryable);
    this.status = status;
  }
}

async function request(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      headers: options.body ? { "content-type": "application/json", ...(options.headers || {}) } : options.headers,
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError({ code: "UNAVAILABLE", message: "The Kampa server did not answer.", hint: "Check that the server is running, then try again." }, 0);
  }

  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new ApiError(json?.error || { message: "The request failed." }, response.status);
  }
  return json;
}

function qs(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export const api = {
  bootstrap: () => request("/api/bootstrap"),
  settings: () => request("/api/settings"),
  saveSettings: (body) => request("/api/settings", { method: "POST", body }),
  deleteAll: () => request("/api/settings", { method: "DELETE" }),
  test: (network) => request("/api/settings/test", { method: "POST", body: { network } }),
  login: (password) => request("/api/auth", { method: "POST", body: { password } }),
  logout: () => request("/api/auth", { method: "DELETE" }),
  overview: (params) => request(`/api/overview${qs(params)}`),
  data: (network, params) => request(`/api/${network}${qs(params)}`),
  adlib: (body) => request("/api/tiktok/adlib", { method: "POST", body }),
  disconnectYouTube: () => request("/api/youtube/disconnect", { method: "POST", body: {} }),
};
