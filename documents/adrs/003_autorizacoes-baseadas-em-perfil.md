---
Identificador: 003
Situação: Aceito
Título: Autorização Baseada em Perfis (RBAC)
Criação: 29-09-2026
Atualização: 
---

# Contexto

O VetCare armazena dados pessoais de tutores, informações clínicas de animais, prontuários, prescrições e dados financeiros. Naturalmente, o documento de requisitos prevê diferentes perfis de acesso (Administrador, Recepcionista e Veterinário) e restringe informações clínicas e dados pessoais a usuários autorizados.

# Decisão

O sistema deve contar com autenticação obrigatória com autorização baseada em perfis. O usuário pode ter um ou mais perfis, quais incluem uma ou mais permissões. As ações requerem uma ou mais permissões.

# Consequências

## Positivas

- Controle escalável e semântico de responsabilidades.

## Negativas

- Complexidade de código.

## Alternativas Consideradas

- Apenas usuários e permissões.
