# VetCare — Sistema de Gestão para Clínicas Veterinárias

> Trabalho da disciplina de **Engenharia de Software** — Modelagem arquitetural e documentação do sistema VetCare, desenvolvido na Universidade Federal da Bahia (UFBA).

![React](https://img.shields.io/badge/React-18.x-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![UFBA](https://img.shields.io/badge/UFBA-Engenharia_de_Software-blue?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)

---

## Sobre o Projeto

Este repositório contém a **documentação arquitetural** e os artefatos de modelagem do **VetCare**, um sistema de software desenvolvido como parte da disciplina de **Engenharia de Software** da **Universidade Federal da Bahia (UFBA)**. 

O objetivo é aplicar na prática os conceitos de:
- Modelagem de arquitetura de software
- Definição de características arquiteturais e requisitos não funcionais
- Organização de componentes e pacotes (UML)
- Documentação técnica e prototipação de interfaces
- Integração entre equipes e boas práticas de desenvolvimento

O sistema tem como objetivo gerenciar as operações diárias de uma clínica veterinária, abrangendo desde o cadastro de tutores e animais até o gerenciamento clínico, financeiro e de suporte.

---

## Características Arquiteturais

Para garantir que o VetCare atenda às necessidades do negócio e dos usuários, as seguintes características arquiteturais foram consideradas prioritárias (Top 4):

- [x] **Segurança**: Tratada como prioridade base. Autenticação e autorização não são camadas adicionais, mas sim fundamentais para proteger os dados clínicos e pessoais (LGPD).
- [x] **Disponibilidade e Estabilidade**: O sistema deve permanecer operante durante o horário de funcionamento. Requer mecanismos de tolerância a falhas e monitoramento.
- [x] **Desempenho**: As operações frequentes (agenda, prontuário) devem ser otimizadas para garantir a eficiência do atendimento.
- [x] **Manutenibilidade**: A arquitetura deve favorecer a evolução do sistema com baixo impacto, facilitando correções e adaptações futuras.

> **Outras características consideradas:** Usabilidade, Auditabilidade, Confiabilidade.

---

## Arquitetura do Sistema

O VetCare foi projetado seguindo uma arquitetura em camadas combinada com a separação por domínios de negócio. O objetivo é promover **alta coesão** e **baixo acoplamento**, facilitando a manutenção e evolução do sistema.

### Visão Hierárquica (Árvore de Pacotes)

```text
VetCare
├── apresentacao
│   ├── ui
│   └── gateway
├── seguranca
│   ├── autenticacao
│   ├── autorizacao
│   └── auditoria
├── cadastros
│   ├── usuarios
│   ├── tutores
│   ├── animais
│   └── veterinarios
├── clinico
│   ├── agenda
│   ├── atendimentos
│   ├── prontuarios
│   ├── vacinacao
│   └── prescricoes
├── financeiro
│   ├── pagamentos
│   ├── dashboard
│   └── relatorios
├── suporte
│   ├── notificacoes
│   ├── cache
│   ├── fila
│   ├── backup
│   └── monitoramento
└── persistencia
    └── banco_dados
```

### Critério de Organização dos Pacotes
Os pacotes foram organizados por **camada arquitetural** e por **domínio de negócio**:
*   `apresentacao`: Concentra a interação com o usuário e o ponto único de entrada (API Gateway).
*   `seguranca`: Componente transversal que agrupa autenticação, autorização e auditoria.
*   `cadastros`, `clinico`, `financeiro`: Os três domínios de negócio principais do VetCare.
*   `suporte`: Serviços técnicos reutilizáveis (cache, fila, backup, monitoramento, notificações).
*   `persistencia`: Isolamento do acesso ao banco de dados.

---

## Componentes Candidatos

Abaixo estão listados os componentes do sistema, suas responsabilidades e as características arquiteturais associadas.

### Principais Módulos e Serviços

| Componente | Responsabilidade | Características |
|-----------|------------------|-----------------|
| **API Gateway** | Ponto único de entrada, roteamento, autenticação inicial e rate limiting. | Segurança, Manutenibilidade, Desempenho |
| **Serviço de Autenticação** | Validação de credenciais e emissão de tokens. | Segurança, Disponibilidade |
| **Serviço de Autorização (RBAC)** | Controle de permissões por papéis (Admin, Recepcionista, Veterinário). | Segurança, Manutenibilidade |
| **Módulo de Auditoria** | Registro de acessos e alterações para conformidade legal. | Segurança, Confiabilidade, Auditabilidade |
| **Módulo de Agenda/Consultas** | Agendamento, cancelamento e visualização de consultas. | Desempenho, Disponibilidade, Manutenibilidade |
| **Módulo de Prontuários** | Histórico de diagnósticos, observações e prescrições. | Segurança, Desempenho, Confiabilidade |
| **Módulo de Pagamentos** | Registro de pagamentos de consultas e procedimentos. | Segurança, Confiabilidade, Manutenibilidade |
| **Banco de Dados** | Persistência de todos os dados do sistema. | Segurança, Disponibilidade, Confiabilidade, Desempenho |
| **Serviço de Processamento Assíncrono** | Tarefas não bloqueantes (notificações, relatórios). | Desempenho, Disponibilidade, Manutenibilidade |

> **Importante:** Os componentes acima destacados fazem parte do **Top 30% mais críticos** e serão detalhados internamente na próxima etapa do projeto.

---

## Tecnologias Sugeridas

### Contexto Acadêmico
- **Instituição:** Universidade Federal da Bahia (UFBA)
- **Disciplina:** MATA62 - ENGENHARIA DE SOFTWARE I
- **Semestre:** T02 (2026.2)
- **Professor(a):** LARISSA BARBOSA LEONCIO PINHEIRO
- **Trabalho:** Trabalho I – Arquitetura do Sistema VetCare (Etapa I)

---

## Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

---

## Referências

- [Documentação React](https://react.dev/)
- [Documentação Node.js](https://nodejs.org/)
- [Documentação PostgreSQL](https://www.postgresql.org/docs/)

