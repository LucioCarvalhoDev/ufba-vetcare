# VetCare - Sistema de Gestão para Clínicas Veterinárias

![Status](https://img.shields.io/badge/Status-Em_Desenvolvimento-yellow)
![Disciplina](https://img.shields.io/badge/UFBA-Engenharia_de_Software-blue)

Este repositório contém a documentação arquitetural e o diagrama de pacotes do **VetCare**, um sistema de software desenvolvido como parte da disciplina de Engenharia de Software da Universidade Federal da Bahia (UFBA). O sistema tem como objetivo gerenciar as operações diárias de uma clínica veterinária, abrangendo desde o cadastro de tutores e animais até o gerenciamento clínico, financeiro e de suporte.

---

## 1. Características Arquiteturais Relevantes

Para garantir que o VetCare atenda às necessidades do negócio e dos usuários, as seguintes características arquiteturais foram consideradas prioritárias:

*   **Segurança**: O sistema lida com dados sensíveis (pessoais, clínicos e financeiros). É essencial garantir autenticação, autorização baseada em perfis (Administrador, Recepcionista, Veterinário) e conformidade com a LGPD.
*   **Disponibilidade e Estabilidade**: A clínica depende do sistema durante todo o expediente. A arquitetura deve prever redundância, tolerância a falhas e mecanismos de recuperação para evitar a perda de dados críticos (ex: marcação de exames vitais).
*   **Usabilidade**: Com alta rotatividade de funcionários e um ambiente de trabalho dinâmico, a interface deve ser intuitiva e consistente, reduzindo erros operacionais e a necessidade de treinamentos extensivos.
*   **Desempenho**: Operações críticas como consulta de agenda, acesso a prontuários e registros de pagamentos devem responder rapidamente para não comprometer o fluxo de atendimento e gerar filas.
*   **Manutenibilidade**: O sistema deve ser modular e com baixo acoplamento, permitindo a inclusão de novas funcionalidades (relatórios, integrações, regras de vacinação) sem grandes impactos nos componentes existentes.

### Top 4 Características (Decisões Arquiteturais)

1.  **Segurança**: Tratada como prioridade base. Autenticação e autorização não são camadas adicionais, mas sim fundamentais para proteger os dados clínicos e pessoais.
2.  **Disponibilidade e Estabilidade**: O sistema deve permanecer operante durante o horário de funcionamento. Requer mecanismos de tolerância a falhas e monitoramento.
3.  **Desempenho**: As operações frequentes (agenda, prontuário) devem ser otimizadas para garantir a eficiência do atendimento.
4.  **Manutenibilidade**: A arquitetura deve favorecer a evolução do sistema com baixo impacto, facilitando correções e adaptações futuras.

---

## 2. Arquitetura do Sistema

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
