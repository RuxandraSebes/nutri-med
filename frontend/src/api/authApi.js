import { baseFetch } from "./baseFetch.js";

export const authApi = {
  register: (body) => baseFetch("/api/auth/register", { method: "POST", body }),
  login: (body) => baseFetch("/api/auth/login", { method: "POST", body }),
  me: () => baseFetch("/api/auth/me"),
};

