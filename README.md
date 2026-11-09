# VetCare — Sistema de Gestão para Clínicas Veterinárias

> Sistema acadêmico de gestão para clínicas veterinárias, desenvolvido na Universidade Federal da Bahia (UFBA), com implementação full-stack incremental sobre a arquitetura documentada na Etapa I.

![React](https://img.shields.io/badge/React-18.x-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-24%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white)
![UFBA](https://img.shields.io/badge/UFBA-Engenharia_de_Software-blue?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)

---

## Sobre o Projeto

O VetCare tem como objetivo gerenciar as operações diárias de uma clínica veterinária, abrangendo cadastros, agenda, disponibilidade profissional e acompanhamento do atendimento.

O repositório reúne:

- documentação arquitetural e ADRs;
- protótipo de interfaces;
- implementação full-stack;
- testes automatizados de API e domínio;
- roteiro de evolução dos requisitos.

### Estado atual

- **21 testes automatizados** passando.
- `npm run typecheck` e `npm run build` passando.
- Banco SQLite com **4 migrations versionadas**.
- **5 requisitos completos**, 3 parciais e 9 pendentes dos 17 requisitos funcionais.
- Cobertura completa de aproximadamente **30%** dos requisitos, com os principais fluxos de cadastro, autenticação e agenda implementados.

---

## Funcionalidades Implementadas

### Segurança e acesso

- Login com sessão persistida em cookie `HttpOnly`.
- Logout e restauração de sessão.
- RBAC com papéis **Administrador**, **Recepcionista** e **Veterinário**.
- Permissões granulares por módulo e ação.
- Auditoria de login, alterações e exclusões no backend.
- Proteção contra remoção do último administrador ativo.

### Usuários

- Listagem, criação e edição de usuários.
- Associação de múltiplos papéis.
- Ativação e desativação.
- Filtros por nome, e-mail, papel e situação.

### Tutores e animais

- CRUD completo de tutores.
- CRUD completo de animais, vinculados a um tutor.
- Filtros por busca, tutor e situação.
- Exclusão com confirmação.
- Bloqueio de exclusão de tutor com animais vinculados.
- Bloqueio de exclusão de animal com agendamentos vinculados.

### Agenda

- Agendamento de **consultas**, **operações** e **vacinações**.
- Edição, cancelamento e listagem.
- Validação de conflito por veterinário, data e duração.
- Filtros por animal/tutor, tipo, situação e profissional.
- Agenda visual semanal com:
  - horários livres em verde;
  - horários sem profissionais livres em amarelo;
  - horários sem atendimento em cinza;
  - seleção contígua em azul;
  - horário padrão de 07:00 a 17:30, com switch para o dia completo.
- Seleção auxiliar de profissional com busca textual e filtro por disponibilidade e conflitos.

### Disponibilidade profissional

- Grade semanal de 30 minutos.
- Seleção e remoção por clique ou arrasto.
- Switch de horários não padrão.
- Persistência por veterinário.

### Minha Agenda do veterinário

- Página inicial exclusiva para veterinários.
- Métricas do dia: consultas, concluídas, pendentes e canceladas.
- Próximas consultas em linha do tempo, com hoje e amanhã.
- Calendário mensal navegável com dias que possuem consultas.
- Resumo semanal em gráfico de barras.

---

## Cobertura dos Requisitos

| REQ | Status | Situação |
|---|---|---|
| 01 — Manter usuário | 🟡 Parcial | Criar, listar e editar; falta exclusão de usuário. |
| 02 — Autenticar usuário | ✅ Completo | Login, sessão, logout e RBAC. |
| 03 — Recuperar senha | ⬜ Pendente | — |
| 04 — Manter tutor | ✅ Completo | CRUD completo, com exclusão protegida. |
| 05 — Manter animal | ✅ Completo | CRUD completo, com exclusão protegida. |
| 06 — Manter veterinário | 🟡 Parcial | Vets via usuário + disponibilidade; falta perfil com CRMV/especialidade. |
| 07 — Agendar consulta | ✅ Completo | Consulta, operação e vacinação, com agenda visual. |
| 08 — Cancelar consulta | ✅ Completo | Cancelamento e liberação do horário. |
| 09 — Consultar agenda | 🟡 Parcial | Minha Agenda e filtros por profissional; falta visão dia/semana na agenda geral. |
| 10 — Registrar atendimento | ⬜ Pendente | — |
| 11 — Manter prontuário | ⬜ Pendente | — |
| 12 — Registrar vacinação | ⬜ Pendente | Existe apenas o agendamento do tipo vacinação. |
| 13 — Emitir prescrição | ⬜ Pendente | — |
| 14 — Registrar pagamento | ⬜ Pendente | — |
| 15 — Dashboard financeiro | ⬜ Pendente | — |
| 16 — Notificar tutor | ⬜ Pendente | — |
| 17 — Gerar relatórios gerenciais | ⬜ Pendente | — |

**Resumo:** 5 completos, 3 parciais e 9 pendentes. A meta inicial de aproximadamente 30% dos requisitos foi atingida.

---

## Arquitetura

O VetCare utiliza uma arquitetura em camadas combinada com separação por domínios de negócio.

### Frontend

- React 18 + TypeScript.
- Vite para desenvolvimento e build.
- SPA com roteamento próprio baseado em History API.
- Componentes reutilizáveis de tabela, agenda, disponibilidade e formulários.
- Layout responsivo com `AppShell` compartilhado.

### Backend

- Node.js com servidor HTTP nativo.
- SQLite via `node:sqlite`.
- Migrations versionadas com `PRAGMA user_version`.
- Repositórios por domínio.
- RBAC e auditoria transversais.
- API JSON com validação, tratamento de erros e cookies de sessão.

### Estrutura de código

```text
src/
├── components/       # AppShell, ícones e agenda visual
├── lib/              # API, navegação, formatação e utilitários
├── pages/            # Login, cadastros, agenda, disponibilidade e dashboard
├── types/            # Contratos TypeScript
└── App.tsx           # Composição das rotas
server/
├── app.js            # Servidor HTTP e rotas de autenticação/usuários
├── appointments.js   # API de agendamentos
├── availability.js   # API de disponibilidade
├── schedule.js       # Agenda visual semanal
├── dashboard.js      # Dashboard do veterinário
├── records.js        # API de tutores e animais
├── db/
│   ├── migrations/   # 001 a 004
│   ├── repositories/ # Usuários, agenda, disponibilidade, dashboard etc.
│   ├── connection.js
│   ├── migrations.js
│   ├── seed.js
│   └── index.js
├── app.test.js
└── domain.test.js
```

### Modelo de dados atual

- `users`, `roles`, `permissions`, `user_roles`, `role_permissions`
- `sessions`
- `audit_logs`
- `tutors`
- `animals`
- `appointments`
- `veterinarian_availability`

---

## API

Principais endpoints:

```text
POST   /api/auth/login
GET    /api/auth/me
POST   /api/auth/logout

GET    /api/users
POST   /api/users
GET    /api/users/:id
PUT    /api/users/:id
GET    /api/roles

GET    /api/tutors
POST   /api/tutors
GET    /api/tutors/:id
PUT    /api/tutors/:id
DELETE /api/tutors/:id

GET    /api/animals
POST   /api/animals
GET    /api/animals/:id
PUT    /api/animals/:id
DELETE /api/animals/:id

GET    /api/appointments
POST   /api/appointments
GET    /api/appointments/:id
PUT    /api/appointments/:id
POST   /api/appointments/:id/cancel

GET    /api/veterinarians
GET    /api/veterinarians/:id/availability
PUT    /api/veterinarians/:id/availability
GET    /api/schedule
GET    /api/veterinarian-dashboard
```

---

## Como executar

Pré-requisitos: **Node.js >= 24** — necessário para `node:sqlite` sem flags experimentais.

1. Crie o arquivo de ambiente e defina a senha inicial do administrador:

```bash
cp .env.example .env
# edite ADMIN_PASSWORD no .env
```

2. Instale as dependências:

```bash
npm install
```

3. Inicie o ambiente de desenvolvimento:

```bash
npm run dev
```

O Vite exibe a URL do frontend e encaminha `/api` para o servidor em `http://127.0.0.1:3001`.

4. Para produção:

```bash
npm run build
npm start
```

O banco SQLite é criado em `data/vetcare.db`. O arquivo `.env` e o diretório `data/` são ignorados pelo Git. Para redefinir a senha do administrador, atualize `ADMIN_PASSWORD` e execute:

```bash
npm run db:seed
```

---

## Testes

```bash
npm test
npm run typecheck
npm run build
```

A suíte cobre autenticação, RBAC, usuários, tutores, animais, agendamentos, conflitos, cancelamento, disponibilidade, agenda semanal e dashboard do veterinário.

---

## Protótipo e Documentação

- **Protótipo navegável:** [Figma](https://www.figma.com/design/RyttkdA9VockglJyTNJYqA/Sem-t%25C3%25ADtulo?node-id=1-3&t=sLbbEYodTy7TzK69-0)
- **Documento de requisitos:** [Google Docs](https://docs.google.com/document/d/1Q5mlRNlOBcRVlrh8S1Xe0NLVUcPYFrlbgivGcqV6Myo/edit?tab=t.vslsqmnwl6d2)
- **ADRs:** [documents/adrs](documents/adrs)
- **Documentos da etapa:** [documents/requirements](documents/requirements)

---

## Próximos Passos

1. Excluir usuários com proteção do último administrador.
2. Adicionar visão dia/semana na agenda geral.
3. Definir perfil profissional do veterinário com CRMV e especialidade.
4. Implementar atendimento e prontuário clínico.
5. Registrar vacinação e prescrições.
6. Registrar pagamentos, dashboard financeiro e relatórios.
7. Recuperar senha e notificar tutores.
8. Adicionar CI, backup automatizado e E2E integrado à suíte.

---

## Contexto Acadêmico

- **Instituição:** Universidade Federal da Bahia (UFBA)
- **Disciplina:** MATA62 — Engenharia de Software I
- **Semestre:** T02 (2026.2)
- **Professor(a):** Larissa Barbosa Leôncio Pinheiro
- **Trabalho:** Arquitetura do Sistema VetCare — Etapa I + implementação incremental

---

## Licença

Este projeto está sob a licença MIT.
