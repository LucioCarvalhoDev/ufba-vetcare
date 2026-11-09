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

## Protótipo do Sistema

Nesta seção, estão disponíveis as interfaces visuais do VetCare, desenvolvidas para validar a usabilidade e a experiência do usuário antes da implementação final. O protótipo navegável pode ser acessado através do link abaixo.

**[Link para o Protótipo Navegável (Figma)](https://www.figma.com/design/RyttkdA9VockglJyTNJYqA/Sem-t%25C3%25ADtulo?node-id=1-3&t=sLbbEYodTy7TzK69-0)**

### Tela de Login
Interface de autenticação de usuários, contendo campos para e-mail/usuário e senha, além de opção de recuperação de senha.
*(Substitua a imagem abaixo pelo print da tela de login)*
![Tela de Login]([https://via.placeholder.com/800x450?text=Print+da+Tela+de+Login](https://www.figma.com/design/RyttkdA9VockglJyTNJYqA/Sem-t%C3%ADtulo?node-id=1-2&t=sLbbEYodTy7TzK69-1))

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

### Contexto Acadêmico
- **Instituição:** Universidade Federal da Bahia (UFBA)
- **Disciplina:** MATA62 - ENGENHARIA DE SOFTWARE I
- **Semestre:** T02 (2026.2)
- **Professor(a):** LARISSA BARBOSA LEONCIO PINHEIRO
- **Trabalho:** Trabalho I – Arquitetura do Sistema VetCare (Etapa I)

---

## Como executar a implementação

Pré-requisitos: **Node.js >= 24** (necessário para `node:sqlite` sem flags experimentais).

1. Crie o arquivo de ambiente e defina a senha inicial do administrador:
   ```bash
   cp .env.example .env
   # edite ADMIN_PASSWORD no .env
   ```
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Inicie o banco e o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```
   O Vite exibe a URL do frontend e encaminha `/api` para o servidor em `http://127.0.0.1:3001`.

4. Para a versão de produção:
   ```bash
   npm run build
   npm start
   ```

O banco SQLite é criado em `data/vetcare.db` e o usuário administrador inicial é `admin@vetcare.com`. O arquivo `.env` e o diretório `data/` são ignorados pelo Git. Para redefinir a senha do administrador, atualize `ADMIN_PASSWORD` e execute `npm run db:seed`.

Testes da API e do RBAC:
```bash
npm test
```

---

## Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

---

## Referências

- [Documentação React](https://react.dev/)
- [Documentação Node.js](https://nodejs.org/)
- [Documentação PostgreSQL](https://www.postgresql.org/docs/)

