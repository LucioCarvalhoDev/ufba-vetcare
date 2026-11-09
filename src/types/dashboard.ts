import type { AppointmentStatus, AppointmentType } from "./appointments";

export type DashboardAppointment = {
  id: string;
  scheduledAt: string;
  durationMinutes: number;
  status: AppointmentStatus;
  type: AppointmentType;
  animalName: string;
  animalSpecies: string;
  tutorName: string;
};

export type DashboardUpcomingAppointment = DashboardAppointment & {
  date: string;
};

export type VeterinarianDashboard = {
  date: string;
  veterinarian: {
    id: string;
    name: string;
  };
  metrics: {
    total: number;
    completed: number;
    pending: number;
    cancelled: number;
  };
  appointments: DashboardAppointment[];
  upcoming: DashboardUpcomingAppointment[];
  month: {
    key: string;
    days: { date: string; count: number }[];
  };
  week: {
    from: string;
    days: { date: string; weekday: number; count: number }[];
    total: number;
  };
};

export type DashboardQuery = {
  date?: string;
  month?: string;
};
