
# AGENTS.md — Diretrizes para Agentes Autônomos

## 1. Princípios Operacionais Core
* **Escopo Mínimo (Small Batches):** Cada execução deve focar em uma única tarefa lógica. Não execute refatorações adicionais ou melhorias de código fora da demanda explícita.
* **Commit-Driven Development:** Toda alteração válida e testada deve resultar em um commit atômico e bem fundamentado.

---

## 2. Fluxo de Trabalho Passo a Passo


```

[1. Entendimento] ──> [2. Execução Isolada] ──> [3. Validação] ──> [4. Commit Atômico] ──> [5. Handoff Humano]

```

### Passo 1: Delimitação e Análise
1. Leia o escopo da task solicitada.
2. Identifique os arquivos específicos que precisam de modificação.
3. Se a task exigir alterações em mais de 3 arquivos ou afetar múltiplos módulos independentes, **interrompa e solicite a decomposição da tarefa ao usuário humano**.

### Passo 2: Execução Incremental
1. Crie ou confirme que está trabalhando em uma branch de recurso/ajuste (ex: `feature/`, `fix/`).
2. Aplique a alteração mínima necessária para atender aos critérios de aceite da task.

### Passo 3: Validação Local (Obrigatória)
Antes de sinalizar a conclusão da task, execute localmente:
1. **Linter e Formatador:** Garanta conformidade com as regras de estilo do projeto.
2. **Verificação de Tipagem / Compilação:** Certifique-se de que não há erros de tipos ou compilação.
3. **Suíte de Testes:** Execute os testes existentes relacionados à alteração e adicione novos testes unitários para a funcionalidade adicionada.

> **Nota:** Se os testes falharem, corrija o código antes de tentar realizar o commit.

### Passo 4: Estrutura de Commit
Realize o commit apenas após os testes passarem. Utilize a especificação de [Conventional Commits](https://www.conventionalcommits.org/):

```bash
git add <arquivos-modificados-específicos>
git commit -m "<tipo>(<escopo>): <descrição sucinta no imperativo>"

```

**Regras de Commit:**

* Não adicione arquivos não relacionados (ex: `.DS_Store`, arquivos de configuração temporários ou logs).
* Opcional: inclua no corpo do commit um resumo de 1 linha detalhando o raciocínio técnico.

### Passo 5: Handoff e Notificação

Ao concluir o commit:

1. Não faça novos commits sem instrução explícita.
2. Apresente um resumo claro para o auditor humano contendo:
* **Arquivos alterados.**
* **Status dos testes executados.**
* **Hash ou mensagem do commit gerado.**
* **Dúvidas ou riscos identificados.**

---

## 3. Limites Autônomos (O que o agente NÃO pode fazer)

1. **Destruição de Histórico:** Proibido o uso de `git push --force`, `git reset --hard` em branches remotas ou alteração do histórico git compartilhado.
2. **Gerenciamento de Dependências:** Proibido instalar, atualizar ou remover pacotes/bibliotecas sem autorização prévia.
3. **Segredos e Variáveis de Ambiente:** NUNCA codifique credenciais, tokens ou chaves em arquivos versionados. Se identificar a falta de um segredo, reporte imediatamente.
4. **Alteração de Infraestrutura:** Mudanças em Dockerfiles, pipelines CI/CD ou arquivos de orquestração requerem aprovação explícita prévia.

---

## 4. Estratégia em Caso de Bloqueio ou Erro

Se o erro persistir após 2 tentativas consecutivas de correção:

1. Desfaça as alterações não commitadas (`git checkout .`).
2. Documente a falha, o comportamento esperado e os logs de erro observados.
3. Devolva o controle para a revisão humana.
