/**
 * Catálogo de permissões e papéis do VetCare.
 *
 * As permissões usam o formato `<módulo>.<ação>`. Papéis apenas agrupam
 * permissões; a autorização real é sempre verificada por permissão.
 */
export const PERMISSIONS = [
  { code: "users.read", module: "users", action: "read", description: "Consultar usuários" },
  { code: "users.write", module: "users", action: "write", description: "Criar, alterar e excluir usuários" },
  { code: "roles.read", module: "roles", action: "read", description: "Consultar papéis" },
  { code: "roles.write", module: "roles", action: "write", description: "Criar, alterar e excluir papéis" },
  { code: "tutors.read", module: "tutors", action: "read", description: "Consultar tutores" },
  { code: "tutors.write", module: "tutors", action: "write", description: "Criar, alterar e excluir tutores" },
  { code: "animals.read", module: "animals", action: "read", description: "Consultar animais" },
  { code: "animals.write", module: "animals", action: "write", description: "Criar, alterar e excluir animais" },
  { code: "veterinarians.read", module: "veterinarians", action: "read", description: "Consultar veterinários" },
  { code: "veterinarians.write", module: "veterinarians", action: "write", description: "Criar, alterar e excluir veterinários" },
  { code: "appointments.read", module: "appointments", action: "read", description: "Consultar a agenda" },
  { code: "appointments.write", module: "appointments", action: "write", description: "Agendar e cancelar consultas" },
  { code: "medical_records.read", module: "medical_records", action: "read", description: "Consultar prontuários" },
  { code: "medical_records.write", module: "medical_records", action: "write", description: "Registrar atendimentos e prontuários" },
  { code: "prescriptions.read", module: "prescriptions", action: "read", description: "Consultar prescrições" },
  { code: "prescriptions.write", module: "prescriptions", action: "write", description: "Emitir prescrições" },
  { code: "vaccinations.read", module: "vaccinations", action: "read", description: "Consultar vacinação" },
  { code: "vaccinations.write", module: "vaccinations", action: "write", description: "Registrar vacinação" },
  { code: "payments.read", module: "payments", action: "read", description: "Consultar pagamentos" },
  { code: "payments.write", module: "payments", action: "write", description: "Registrar pagamentos" },
  { code: "dashboard.read", module: "dashboard", action: "read", description: "Acessar o dashboard" },
  { code: "reports.read", module: "reports", action: "read", description: "Gerar relatórios gerenciais" },
  { code: "notifications.manage", module: "notifications", action: "manage", description: "Gerenciar notificações" },
  { code: "audit.read", module: "audit", action: "read", description: "Consultar a auditoria" },
];

const ALL_PERMISSIONS = PERMISSIONS.map((permission) => permission.code);

export const ROLE_DEFINITIONS = [
  {
    slug: "administrador",
    name: "Administrador",
    description: "Acesso completo ao sistema e à administração de usuários e papéis.",
    permissions: ALL_PERMISSIONS,
  },
  {
    slug: "recepcionista",
    name: "Recepcionista",
    description: "Atendimento ao público, cadastros, agenda, pagamentos e notificações.",
    permissions: [
      "tutors.read",
      "tutors.write",
      "animals.read",
      "animals.write",
      "veterinarians.read",
      "appointments.read",
      "appointments.write",
      "payments.read",
      "payments.write",
      "dashboard.read",
      "reports.read",
      "notifications.manage",
    ],
  },
  {
    slug: "veterinario",
    name: "Veterinário",
    description: "Atendimento clínico, prontuários, prescrições e vacinação.",
    permissions: [
      "tutors.read",
      "animals.read",
      "veterinarians.read",
      "appointments.read",
      "appointments.write",
      "medical_records.read",
      "medical_records.write",
      "prescriptions.read",
      "prescriptions.write",
      "vaccinations.read",
      "vaccinations.write",
      "dashboard.read",
    ],
  },
];

export const ALL_PERMISSION_CODES = ALL_PERMISSIONS;

/**
 * Verifica se o contexto autenticado possui uma permissão.
 * Use esta função em toda rota ou ação protegida.
 *
 * @param {{ permissions?: string[] } | null | undefined} authUser
 * @param {string} permission
 * @returns {boolean}
 */
export function hasPermission(authUser, permission) {
  return Boolean(authUser?.permissions?.includes(permission));
}
