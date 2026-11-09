---
Identificador: 008
Situação: Aceito
Título: SQLite como Banco de Dados Transitório
Criação: 08-11-2026
Atualização:
---

# Contexto

A Etapa 1 previu PostgreSQL como banco de dados do VetCare. A Etapa 2 exige uma primeira implementação funcional, começando por autenticação e autorização baseada em papéis (RBAC). Neste momento, o ambiente de desenvolvimento precisa ser simples de inicializar, sem depender de um serviço externo de banco de dados, e os dados ainda não são compartilhados entre múltiplos processos ou máquinas.

# Decisão

Adotar SQLite, por meio do módulo nativo `node:sqlite`, como banco de dados transitório da primeira etapa de implementação.

O acesso ao banco fica isolado em `server/database.js`, com schema explícito, chaves primárias UUID e consultas preparadas. O schema já modela usuários, papéis, permissões, associações N:N (`user_roles` e `role_permissions`), sessões e auditoria. A substituição por PostgreSQL deverá preservar os contratos da camada de aplicação e exigir uma nova decisão arquitetural quando ocorrer.

# Consequências

## Positivas

- Inicialização local sem serviço externo ou credenciais de infraestrutura.
- Testes automatizados rápidos com bancos temporários.
- Schema e RBAC versionados e fáceis de evoluir.
- Baixo custo para a primeira entrega acadêmica.

## Negativas

- SQLite não oferece a mesma concorrência, replicação e recursos operacionais do PostgreSQL.
- O arquivo local não atende a cenários de múltiplas instâncias da aplicação.
- Será necessária uma migração de dados e de driver em uma etapa futura.

# Alternativas Consideradas

- **PostgreSQL desde o início:** mais próximo da arquitetura final, mas aumenta o custo de configuração e operação da primeira entrega.
- **Banco em memória:** simples, porém não preserva usuários, sessões e auditoria entre reinicializações.
- **ORM com abstração de banco:** reduziria o acoplamento ao SQLite, mas adicionaria uma dependência e complexidade não justificadas nesta etapa.
