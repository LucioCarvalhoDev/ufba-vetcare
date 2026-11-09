export type Role = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
};

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  roles: Role[];
  permissions: string[];
};

export type LoginCredentials = {
  email: string;
  password: string;
};

export type AuthResponse = {
  user: AuthUser;
};
