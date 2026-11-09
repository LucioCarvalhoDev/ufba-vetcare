import type { Role } from "./auth";

export type ManagedUser = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  createdAt: string;
  roles: Role[];
};

export type UserStatusFilter = "" | "active" | "inactive";

export type UserFilters = {
  q?: string;
  role?: string;
  status?: UserStatusFilter;
};

export type CreateUserInput = {
  name: string;
  email: string;
  password: string;
  roleSlugs: string[];
  isActive: boolean;
};

export type UpdateUserInput = {
  name: string;
  email: string;
  password?: string;
  roleSlugs: string[];
  isActive: boolean;
};
