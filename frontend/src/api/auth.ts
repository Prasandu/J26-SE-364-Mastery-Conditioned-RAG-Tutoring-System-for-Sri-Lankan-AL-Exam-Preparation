import { request } from "./client";
import type { AuthUser, TokenOut } from "./types";

export function register(email: string, name: string, password: string): Promise<AuthUser> {
  return request<AuthUser>("/auth/register", { method: "POST", body: { email, name, password } });
}

export function login(email: string, password: string): Promise<TokenOut> {
  return request<TokenOut>("/auth/login", { method: "POST", body: { email, password } });
}

export function me(signal?: AbortSignal): Promise<AuthUser> {
  return request<AuthUser>("/auth/me", { signal });
}

export function updateProfile(name: string): Promise<AuthUser> {
  return request<AuthUser>("/auth/me", { method: "PATCH", body: { name } });
}

export function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return request<void>("/auth/me/password", {
    method: "POST",
    body: { current_password: currentPassword, new_password: newPassword },
  });
}
