export type AppointmentType = "consultation" | "surgery" | "vaccination";
export type AppointmentStatus = "scheduled" | "completed" | "cancelled";

export type Appointment = {
  id: string;
  animalId: string;
  animalName: string;
  animalSpecies: string;
  tutorId: string;
  tutorName: string;
  veterinarianId: string;
  veterinarianName: string;
  type: AppointmentType;
  scheduledAt: string;
  endsAt: string;
  durationMinutes: number;
  status: AppointmentStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Veterinarian = {
  id: string;
  name: string;
  email: string | null;
};

export type AppointmentInput = {
  animalId: string;
  veterinarianId: string;
  type: AppointmentType;
  scheduledAt: string;
  durationMinutes: number;
  notes?: string | null;
  status?: AppointmentStatus;
};

export type AppointmentFilters = {
  q?: string;
  type?: AppointmentType | "";
  status?: AppointmentStatus | "";
  veterinarianId?: string;
};

export type AvailabilitySlot = {
  weekday: number;
  startMinutes: number;
};

export type VeterinarianAvailability = {
  veterinarian: Veterinarian;
  slots: AvailabilitySlot[];
};

export type VeterinarianAvailabilityFilter = {
  weekday: number;
  startMinutes: number;
  durationMinutes: number;
};
