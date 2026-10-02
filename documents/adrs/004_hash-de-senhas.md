---
Identificador: 004
Situação: Aceito
Título: Hash de Senhas
Criação: 29-09-2026
Atualização: 
---

# Contexto

O sistema da VetCare inclui dados sensíveis como senhas, CPFs, documentos médicos e movimentações financeiras.

# Decisão

Armazenar apenas os HASH das senhas dos usuários.

# Consequências

## Positivas

- Mesmo em caso de vazamento os dados seguem protegidos.

## Negativas

- A chave se torna um ponto de falha.

## Alternativas Consideradas

- Usar login por token único via email/celular.

Alternativa rejeita por adicionar complexidade extra desnecessária para os operadores da clínica.
