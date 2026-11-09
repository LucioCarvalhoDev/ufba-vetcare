export type RegistryStatusFilter = "" | "active" | "inactive";

export type Tutor = {
  id: string;
  name: string;
  cpf: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  animalCount: number;
};

export type TutorInput = {
  name: string;
  cpf?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive: boolean;
};

export type AnimalSex = "male" | "female" | "unknown";

export type Animal = {
  id: string;
  tutorId: string;
  tutorName: string;
  name: string;
  species: string;
  breed: string | null;
  sex: AnimalSex;
  birthDate: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AnimalInput = {
  tutorId: string;
  name: string;
  species: string;
  breed?: string | null;
  sex: AnimalSex;
  birthDate?: string | null;
  notes?: string | null;
  isActive: boolean;
};
