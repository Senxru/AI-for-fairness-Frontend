export type AuthRole = "judge" | "court_authority";

const COOKIE_TOKEN = "auth_token";
const COOKIE_ROLE = "auth_role";

function setCookie(name: string, value: string, maxAgeSeconds: number) {
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax`;
}

function deleteCookie(name: string) {
  document.cookie = `${encodeURIComponent(name)}=; Path=/; Max-Age=0; SameSite=Lax`;
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const parts = document.cookie.split(";").map((p) => p.trim());
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = decodeURIComponent(part.slice(0, eq));
    if (k !== name) continue;
    return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}

export function persistAuth(token: string, role: AuthRole) {
  // 7 days
  const maxAge = 60 * 60 * 24 * 7;
  setCookie(COOKIE_TOKEN, token, maxAge);
  setCookie(COOKIE_ROLE, role, maxAge);
}

export function clearAuth() {
  deleteCookie(COOKIE_TOKEN);
  deleteCookie(COOKIE_ROLE);
}

export function getAuthToken(): string | null {
  return getCookie(COOKIE_TOKEN);
}

export function getAuthRole(): AuthRole | null {
  const r = getCookie(COOKIE_ROLE);
  if (r === "judge" || r === "court_authority") return r;
  return null;
}

