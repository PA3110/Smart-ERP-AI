import axios from "axios";

export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("erp_token");
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("erp_token");
      localStorage.removeItem("erp_user");
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

export function apiErrorMessage(err: unknown): string {
  const anyErr = err as any;
  if (anyErr?.response?.data?.error) {
    const details = anyErr.response.data.details;
    if (Array.isArray(details) && details.length) {
      return `${anyErr.response.data.error}: ${details.map((d: any) => d.message).join(", ")}`;
    }
    return anyErr.response.data.error;
  }
  if (anyErr?.message) return anyErr.message;
  return "Something went wrong";
}
