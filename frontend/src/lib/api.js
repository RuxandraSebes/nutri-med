const API_BASE =
  import.meta.env.VITE_API_BASE?.replace(/\/$/, "") || "http://localhost:3000";

export async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;

  const headers = {
    accept: "application/json",
    ...(options.headers || {}),
  };

  let body = options.body;
  if (body && typeof body === "object" && !(body instanceof FormData)) {
    headers["content-type"] = headers["content-type"] || "application/json";
    body = JSON.stringify(body);
  }

  try {
    const resp = await fetch(url, { ...options, headers, body });
    const contentType = resp.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    const data = isJson ? await resp.json().catch(() => null) : await resp.text();

    if (!resp.ok) {
      console.error("API error", { url, status: resp.status, data });
      const msg =
        (data && data.error) || `Request failed with status ${resp.status}`;
      throw new Error(msg);
    }

    return data;
  } catch (err) {
    console.error("Network/API failure", { url, err });
    throw err;
  }
}

