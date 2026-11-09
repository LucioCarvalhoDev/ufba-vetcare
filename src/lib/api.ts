import type {
  AuthResponse,
  AuthUser,
  LoginCredentials,
  Role,
} from "../types/auth";
import type {
  CreateUserInput,
  ManagedUser,
  UpdateUserInput,
  UserFilters,
} from "../types/users";
import type {
  Animal,
  AnimalInput,
  RegistryStatusFilter,
  Tutor,
  TutorInput,
} from "../types/registry";
import type {
  Appointment,
  AppointmentFilters,
  AppointmentInput,
  AvailabilitySlot,
  Veterinarian,
  VeterinarianAvailability,
  VeterinarianAvailabilityFilter,
} from "../types/appointments";

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

export async function fetchUser(id: string): Promise<ManagedUser> {
  const response = await request<{ user: ManagedUser }>(
    `/users/${encodeURIComponent(id)}`,
    { method: "GET" },
  );

  return response.user;
}

export async function updateManagedUser(
  id: string,
  input: UpdateUserInput,
): Promise<ManagedUser> {
  const response = await request<{ user: ManagedUser }>(
    `/users/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      body: JSON.stringify(input),
    },
  );

  return response.user;
}

type RegistryQuery = {
  q?: string;
  status?: RegistryStatusFilter;
};

function registryQuery(filters: RegistryQuery, extra: Record<string, string> = {}) {
  const params = new URLSearchParams();

  if (filters.q) {
    params.set("q", filters.q);
  }

  if (filters.status) {
    params.set("status", filters.status);
  }

  for (const [key, value] of Object.entries(extra)) {
    if (value) {
      params.set(key, value);
    }
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function fetchTutors(filters: RegistryQuery = {}): Promise<Tutor[]> {
  const response = await request<{ tutors: Tutor[]; total: number }>(
    `/tutors${registryQuery(filters)}`,
    { method: "GET" },
  );

  return response.tutors;
}

export async function fetchTutor(id: string): Promise<Tutor> {
  const response = await request<{ tutor: Tutor }>(
    `/tutors/${encodeURIComponent(id)}`,
    { method: "GET" },
  );

  return response.tutor;
}

export async function createTutor(input: TutorInput): Promise<Tutor> {
  const response = await request<{ tutor: Tutor }>("/tutors", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return response.tutor;
}

export async function updateTutor(id: string, input: TutorInput): Promise<Tutor> {
  const response = await request<{ tutor: Tutor }>(
    `/tutors/${encodeURIComponent(id)}`,
    { method: "PUT", body: JSON.stringify(input) },
  );

  return response.tutor;
}

export async function fetchAnimals(
  filters: RegistryQuery & { tutorId?: string; species?: string } = {},
): Promise<Animal[]> {
  const response = await request<{ animals: Animal[]; total: number }>(
    `/animals${registryQuery(filters, {
      tutorId: filters.tutorId ?? "",
      species: filters.species ?? "",
    })}`,
    { method: "GET" },
  );

  return response.animals;
}

export async function fetchAnimal(id: string): Promise<Animal> {
  const response = await request<{ animal: Animal }>(
    `/animals/${encodeURIComponent(id)}`,
    { method: "GET" },
  );

  return response.animal;
}

export async function createAnimal(input: AnimalInput): Promise<Animal> {
  const response = await request<{ animal: Animal }>("/animals", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return response.animal;
}

export async function updateAnimal(
  id: string,
  input: AnimalInput,
): Promise<Animal> {
  const response = await request<{ animal: Animal }>(
    `/animals/${encodeURIComponent(id)}`,
    { method: "PUT", body: JSON.stringify(input) },
  );

  return response.animal;
}

export async function fetchAppointments(
  filters: AppointmentFilters = {},
): Promise<Appointment[]> {
  const params = new URLSearchParams();

  if (filters.q) params.set("q", filters.q);
  if (filters.type) params.set("type", filters.type);
  if (filters.status) params.set("status", filters.status);
  if (filters.veterinarianId) {
    params.set("veterinarianId", filters.veterinarianId);
  }

  const query = params.toString();
  const response = await request<{ appointments: Appointment[]; total: number }>(
    `/appointments${query ? `?${query}` : ""}`,
    { method: "GET" },
  );

  return response.appointments;
}

export async function fetchAppointment(id: string): Promise<Appointment> {
  const response = await request<{ appointment: Appointment }>(
    `/appointments/${encodeURIComponent(id)}`,
    { method: "GET" },
  );

  return response.appointment;
}

export async function createAppointment(
  input: AppointmentInput,
): Promise<Appointment> {
  const response = await request<{ appointment: Appointment }>("/appointments", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return response.appointment;
}

export async function updateAppointment(
  id: string,
  input: AppointmentInput,
): Promise<Appointment> {
  const response = await request<{ appointment: Appointment }>(
    `/appointments/${encodeURIComponent(id)}`,
    { method: "PUT", body: JSON.stringify(input) },
  );

  return response.appointment;
}

export async function cancelAppointment(id: string): Promise<Appointment> {
  const response = await request<{ appointment: Appointment }>(
    `/appointments/${encodeURIComponent(id)}/cancel`,
    { method: "POST" },
  );

  return response.appointment;
}

export async function fetchVeterinarians(
  filter?: VeterinarianAvailabilityFilter,
): Promise<Veterinarian[]> {
  const params = new URLSearchParams();

  if (filter) {
    params.set("weekday", String(filter.weekday));
    params.set("startMinutes", String(filter.startMinutes));
    params.set("durationMinutes", String(filter.durationMinutes));
  }

  const query = params.toString();
  const response = await request<{ veterinarians: Veterinarian[] }>(
    `/veterinarians${query ? `?${query}` : ""}`,
    { method: "GET" },
  );

  return response.veterinarians;
}

export async function fetchVeterinarianAvailability(
  id: string,
): Promise<VeterinarianAvailability> {
  return request<VeterinarianAvailability>(
    `/veterinarians/${encodeURIComponent(id)}/availability`,
    { method: "GET" },
  );
}

export async function updateVeterinarianAvailability(
  id: string,
  slots: AvailabilitySlot[],
): Promise<VeterinarianAvailability> {
  return request<VeterinarianAvailability>(
    `/veterinarians/${encodeURIComponent(id)}/availability`,
    {
      method: "PUT",
      body: JSON.stringify({ slots }),
    },
  );
}
