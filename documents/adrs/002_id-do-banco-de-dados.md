---
Identificador: 002
Situação: Aceito
Título: Indexação do Banco de Dados
Criação: 24-09-2026
Atualização: 
---

# Contexto

A aplicação necessita de um sistema de indexação robusto e flexível para permitir a escalabilidade de funções complexas como geração de ids no client.

# Decisão

Utilizar UUIDs como chaves primárias das tabelas do banco de dados.

# Consequências

## Positivas

- Vazamento de uma chave não dá nenhuma informação sobre ela.
- Possibilidade de geração de id no client.

## Negativas

- Adiciona mais um nível de complexidade.
- Dependendo da versão do UUID podem haver desvantagens na velocidade das queries.

## Alternativas Consideradas

- ID sequêncial tradicional com autoincrement.
