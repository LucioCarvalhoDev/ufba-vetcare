import type {
  AuthResponse,
  AuthUser,
  LoginCredentials,
  Role,
} from "../types/auth";
import type {
  CreateUserInput,
  ManagedUser,
  UserFilters,
} from "../types/users";

type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
  };
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);

  if (init?.body) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;

  try {
    response = await fetch(`/api${path}`, {
      credentials: "same-origin",
      ...init,
      headers,
    });
  } catch {
    throw new ApiError(
      0,
      "network_error",
      "Não foi possível conectar ao servidor. Verifique se a API está em execução.",
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = (await response.json().catch(() => null)) as
    | (T & ApiErrorPayload)
    | null;

  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload?.error?.code ?? "request_failed",
      payload?.error?.message ?? "Não foi possível concluir a solicitação.",
    );
  }

  return payload as T;
}

export async function login(credentials: LoginCredentials): Promise<AuthUser> {
  const response = await request<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(credentials),
  });

  return response.user;
}

export async function fetchCurrentUser(): Promise<AuthUser> {
  const response = await request<AuthResponse>("/auth/me", {
    method: "GET",
  });

  return response.user;
}

export async function logout(): Promise<void> {
  await request<void>("/auth/logout", { method: "POST" });
}

export async function fetchUsers(filters: UserFilters = {}): Promise<ManagedUser[]> {
  const params = new URLSearchParams();

  if (filters.q) {
    params.set("q", filters.q);
  }

  if (filters.role) {
    params.set("role", filters.role);
  }

  if (filters.status) {
    params.set("status", filters.status);
  }

  const query = params.toString();
  const response = await request<{ users: ManagedUser[]; total: number }>(
    `/users${query ? `?${query}` : ""}`,
    { method: "GET" },
  );

  return response.users;
}

export async function fetchRoles(): Promise<Role[]> {
  const response = await request<{ roles: Role[] }>("/roles", {
    method: "GET",
  });

  return response.roles;
}

export async function createManagedUser(
  input: CreateUserInput,
): Promise<ManagedUser> {
  const response = await request<{ user: ManagedUser }>("/users", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return response.user;
}
