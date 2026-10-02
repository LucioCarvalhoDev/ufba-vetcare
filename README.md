# VetCare — Sistema de Gestão para Clínicas Veterinárias

> Trabalho da disciplina de **Engenharia de Software** — Modelagem arquitetural e documentação do sistema VetCare, desenvolvido na Universidade Federal da Bahia (UFBA).

![React](https://img.shields.io/badge/React-18.x-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![UFBA](https://img.shields.io/badge/UFBA-Engenharia_de_Software-blue?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)

---

## Sumário

- [Sobre o Projeto](#-sobre-o-projeto)
- [Características Arquiteturais](#-características-arquiteturais)
- [Arquitetura do Sistema](#-arquitetura-do-sistema)
- [Componentes Candidatos](#-componentes-candidatos)
- [Protótipo do Sistema](#-protótipo-do-sistema)
- [Documentação e Artefatos Externos](#-documentação-e-artefatos-externos)
- [Tecnologias Sugeridas](#-tecnologias-sugeridas)
- [Equipe](#-equipe)
- [Licença](#-licença)

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

## Protótipo do Sistema

Nesta seção, estão disponíveis as interfaces visuais do VetCare, desenvolvidas para validar a usabilidade e a experiência do usuário antes da implementação final. O protótipo navegável pode ser acessado através do link abaixo.

**[Link para o Protótipo Navegável (Figma)](https://link-do-prototipo-aqui.com)**

### Tela de Login
Interface de autenticação de usuários, contendo campos para e-mail/usuário e senha, além de opção de recuperação de senha.
*(Substitua a imagem abaixo pelo print da tela de login)*
![Tela de Login](https://via.placeholder.com/800x450?text=Print+da+Tela+de+Login)

### Tela de Cadastro de Usuário
Interface para inclusão de novos usuários no sistema, contendo campos como nome, e-mail, perfil de acesso (Administrador, Recepcionista, Veterinário) e senha.
*(Incluir a imagem abaixo pelo print da tela de cadastro)*
![Tela de Cadastro de Usuário](https://via.placeholder.com/800x450?text=Print+da+Tela+de+Cadastro)

> **Nota:** Outras telas do sistema (Agenda, Prontuário, Financeiro) podem ser adicionadas nesta seção conforme o avanço do projeto.

---

## Documentação e Artefatos Externos

Para centralizar e facilitar o acesso a todos os artefatos produzidos durante o desenvolvimento do projeto, os documentos complementares estão organizados na tabela abaixo:

| Artefato | Descrição | Link de Acesso |
| :--- | :--- | :--- |
| **Documentação de Requisitos** | Documento completo com os requisitos funcionais e não funcionais do VetCare. | [Acessar Google Docs](https://docs.google.com/document/d/1Q5mlRNlOBcRVlrh8S1Xe0NLVUcPYFrlbgivGcqV6Myo/edit?tab=t.vslsqmnwl6d2) |
| **Diagrama de Pacotes (UML)** | Diagrama visual da arquitetura de pacotes e dependências do sistema. | [Acessar Diagrama](https://docs.google.com/document/d/1Q5mlRNlOBcRVlrh8S1Xe0NLVUcPYFrlbgivGcqV6Myo/edit?tab=t.ubqouu4r2w0l) |
| **Diagrama de Classes (UML)** | Modelagem das entidades e relacionamentos do domínio do sistema. | [Acessar Diagrama](https://link-do-diagrama-aqui.com) |
| **Diagrama de Sequência (UML)** | Representação das interações entre os componentes para fluxos críticos. | [Acessar Diagrama](https://link-do-diagrama-aqui.com) |
| **Protótipo Navegável** | Link direto para o protótipo interativo no Figma. | [Acessar Protótipo](https://link-do-prototipo-aqui.com) |

> **Instruções:** Colocar os links de exemplo acima pelos URLs reais dos documentos da equipe.

---

## Tecnologias Sugeridas

| Tecnologia | Descrição |
|-----------|-----------|
| [React](https://react.dev/) | Biblioteca para construção de interfaces (Frontend) |
| [Node.js](https://nodejs.org/) | Ambiente de execução para o Backend |
| [PostgreSQL](https://www.postgresql.org/) | Banco de dados relacional (Confiabilidade e Integridade) |
| [Redis](https://redis.io/) | Cache em memória para alto desempenho |
| [RabbitMQ](https://www.rabbitmq.com/) / [Kafka](https://kafka.apache.org/) | Mensageria e processamento assíncrono |
| [Docker](https://www.docker.com/) | Containerização e padronização de ambientes |
| [Figma](https://www.figma.com/) | Prototipação de interfaces e design |

---

## Equipe

### Grupo de Desenvolvimento
| Nome | GitHub | Função |
|------|--------|--------|
| [Nome 1] | [@usuario1](https://github.com/usuario1) | Arquiteto(a) de Software |
| [Nome 2] | [@usuario2](https://github.com/usuario2) | Desenvolvedor(a) / Documentador(a) |
| [Nome 3] | [@usuario3](https://github.com/usuario3) | Desenvolvedor(a) / Documentador(a) |

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

---

<p align="center">
  Desenvolvido com 💙 para a disciplina de <strong>Engenharia de Software - UFBA</strong>
</p>
