---
Identificador: 009
Situação: Aceito
Título: Tabela de Botões para Agenda e Disponibilidade
Criação: 10-11-2026
Atualização:
---

# Contexto

O VetCare é usado por recepcionistas e veterinários que precisam localizar horários livres e definir a disponibilidade semanal com rapidez, muitas vezes durante o próprio atendimento. As telas de agendamento e de disponibilidade compartilham a mesma estrutura: dias na horizontal e intervalos de 30 minutos na vertical.

Um formulário com campos de data e hora exigiria digitação e não mostraria a ocupação da semana. Uma grade feita apenas com `div`s exigiria reimplementar foco, navegação por teclado e estados de acessibilidade. A aplicação também mantém dependências mínimas e não utiliza biblioteca de calendário. A principal justificativa da decisão é oferecer uma **UI intuitiva e simples**: o usuário enxerga a semana inteira e resolve a tarefa com poucos cliques, sem etapas intermediárias.

# Decisão

Representar os horários como uma tabela HTML em que cada célula contém um `<button>` nativo, com intervalos de 30 minutos e estados visuais explícitos: livre, sem profissionais livres, sem atendimento e selecionado.

O padrão é reutilizado em duas telas:

- **Agendamento:** a grade semanal de `ScheduleGrid` exibe os estados calculados por `GET /api/schedule`; apenas células livres podem ser selecionadas. Clique ou arrasto definem início e duração do agendamento, e a seleção é refletida nos campos do formulário.
- **Disponibilidade:** a grade semanal de `AvailabilityPage` permite marcar e desmarcar blocos de 30 minutos por clique ou arrasto; o conjunto completo é enviado em uma única requisição `PUT`.

Em ambas, o botão é o elemento interativo, com `aria-pressed`, rótulo por dia/horário e foco visível. O arrasto usa eventos de ponteiro e é desabilitado no toque, onde o clique continua disponível. As cores e estados ficam centralizados em variáveis CSS, mantendo a mesma linguagem visual entre as telas.

# Consequências

## Positivas

- Curva de aprendizado baixa: o usuário reconhece dias e horários e clica diretamente no que deseja.
- Seleção rápida de faixas contínuas por arrasto, com menos erros de digitação.
- Acessibilidade apoiada em botões nativos, foco visível e leitores de tela anunciando dia, horário e estado.
- Consistência entre agendamento e disponibilidade, com CSS e comportamentos compartilhados.
- Ausência de dependência de biblioteca de calendário, reduzindo complexidade e tamanho do bundle.

## Negativas

- DOM denso: cada grade tem até 336 botões, o que aumenta o custo de renderização e exige rolagem horizontal em telas pequenas.
- Granularidade fixa de 30 minutos; durações de 15 minutos não são representadas com precisão na grade.
- O arrasto é desabilitado no toque, tornando a seleção menos fluida em dispositivos móveis.
- Uma tabela semântica usada como grade interativa pode gerar anúncios extensos em leitores de tela.
- Legendas, estados e cores precisam ser mantidos em sincronia manualmente.
- A solução cobre a visão semanal; visões diária ou mensal exigiriam outra composição.

# Alternativas Consideradas

- **Biblioteca de calendário (ex.: FullCalendar):** entregaria recursos prontos, mas adicionaria uma dependência pesada e limitaria a aderência ao design do VetCare.
- **Grade com `div`s e eventos de clique:** daria mais liberdade de marcação, porém perderia a semântica e o comportamento nativo de teclado dos botões.
- **Formulário com campos de data e hora:** seria preciso e acessível, mas mais lento para escolher horários e sem visão da ocupação da semana.
- **Grade em Canvas:** teria bom desempenho de desenho, mas seria inacessível e de manutenção mais complexa.
