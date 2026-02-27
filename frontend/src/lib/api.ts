import { getAuthToken } from "./auth";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8001";

export type AuthResponse = {
  access_token: string;
  token_type: "bearer";
  user: {
    id: number;
    username: string;
    full_name?: string | null;
    role: "judge" | "court_authority";
    org_id?: string | null;
  };
};

export async function apiFetch(path: string, init: RequestInit = {}) {
  const token = getAuthToken();
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  return res;
}

