---
Identificador: 6
Situação: Aceito
Título: Filas de Tarefas
Criação: 29-09-2026
Atualização:
---

# Contexto

Operações como consulta de agenda, acesso a prontuários, registro de atendimentos e pagamentos precisam responder em tempo adequado para não comprometer o fluxo de atendimento, ao passo que sistemas [web](001_plataforma.md) são especialmente suscetíveis a falhas e tempos RTP longos.

# Decisão

Requisições tenham o potencial de demorar, como consultas a banco de dados, devem ser disparados como requisições assíncronas e, possivelmente, tratados como "Job Queues" no banco de dados.  

# Consequências

## Positivas

- Interface não é bloqueada durante requisições dando a sensação de fluidez.
- Servidor realiza as tarefas de acordo com a disponibilidade de recursos.

## Negativas

- Complexidade de código.

