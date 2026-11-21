# Componentes e combinações de estratégias

A aba **Estratégias → Combinações** oferece estratégias individuais reutilizáveis, receitas publicadas e combinações cadastradas como grupos. As configurações e os identificadores anteriores continuam válidos.

## Componentes individuais

O catálogo informa o papel de cada componente em `composition_role`:

- `signal`: produz sinais de compra e venda;
- `filter`: autoriza compras, sem criar votos de venda;
- `exit`: participa da regra de venda, sem exigir um voto de compra.

Os novos componentes incluem direção EMA, confirmação ADX, recuperação Bollinger, recuperação RSI, confirmação RSI, confirmação de volume, sinal MACD, preço acima da EMA, faixa RSI, trailing ATR, regime ADX da grade e seleção por ranking. A seleção por ranking exige dados externos e permanece fora da composição livre Spot. Filtros e saídas são selecionáveis em **Adicionar estratégia**; o processamento individual oferece estratégias de sinal.

Uma combinação livre exige ao menos uma estratégia de sinal. Todos os filtros devem permitir a entrada mesmo quando a regra de compra é **Qualquer uma**. O aquecimento de todos os membros continua obrigatório. Venda tem prioridade em conflitos; sinais e saídas participam da regra de venda escolhida. Os fills da carteira compartilhada são propagados a todos os membros e grupos.

## Receitas publicadas

As seis receitas do tutorial usam funções de componentes compartilhadas com as estratégias individuais. O catálogo expõe sua composição em `components`, e a tela exibe os componentes e seus papéis ao selecionar uma receita. A estratégia legada SMA com confirmação RSI também compartilha sua regra de confirmação.

As receitas preservam seus parâmetros, aquecimento, indicadores, motivos de sinal, sequência de atualizações e stops anteriores. Elas usam um contexto compartilhado de indicadores e estado para manter o comportamento histórico. A grade mantém sua política específica de espaçamento ATR e ordens limitadas. A configuração publicada continua sendo o caminho para executar exatamente essa receita.

Para uma nova composição livre, os parâmetros de cada componente são independentes. Alterá-los ou mudar as regras de compra/venda cria outro comportamento; a interface não promete equivalência automática a uma receita publicada.

## Combinações cadastradas como grupos

Em **Adicionar estratégia**, abra a categoria **Combinações cadastradas** e selecione uma combinação compatível. Uma cópia completa de sua configuração é incorporada como membro, preservando nome, regras, parâmetros e agrupamentos internos. Por exemplo, `(A OU B) E C` conserva a regra `OU` no primeiro grupo.

Editar ou excluir a origem não modifica a cópia incorporada nem processamentos existentes. Para atualizar um grupo, remova-o e adicione novamente a configuração desejada. Não há referências dinâmicas entre cadastros; portanto, não há ciclos de dependência. A edição não oferece o próprio cadastro como origem.

Cada grupo livre contém de 2 a 8 membros distintos. A API limita a árvore a 4 níveis de combinações e 64 membros de estratégia no total, contando uma receita publicada como um membro executável. Grades, DCA e estratégias com dados externos ou carteiras especiais mantêm as restrições anteriores e não podem ser incorporadas em grupos Spot livres.

**Importar componentes de uma combinação**, disponível como ação secundária abaixo dos cartões, mantém sua função anterior: copia membros sem copiar as regras do grupo de origem. Use a adição como grupo para preservar as regras.

O histórico, os parâmetros do PDF e os indicadores do gráfico suportam os grupos aninhados. A API continua aceitando membros antigos com `strategy_id` e `parameters`; um grupo utiliza `combination` com a definição incorporada, `strategy_id` vazio e parâmetros vazios. A API rejeita um membro que tente definir simultaneamente uma estratégia e um grupo.

## Validação e atualização

A regressão inclui 110 referências de execuções completas capturadas antes da refatoração: 22 estratégias em cinco cenários. As referências abrangem indicadores, avaliações, eventos, ledger, patrimônio e resumo. Outros 16 casos comparam operações e patrimônio das quatro receitas Spot com composições explícitas de seus componentes.

Atualize e reinicie API, worker e frontend juntos. Não é necessária migração dos cadastros existentes. Os resultados do modo demo continuam sintéticos; os testes financeiros e de execução rodam no motor da API.

## Seleção de componentes

Clique em **＋ Adicionar estratégia** para abrir o painel. Use a busca por nome, indicador, função ou identificador, ou filtre pelas categorias **Sinais**, **Filtros de compra**, **Saídas**, **Combinações prontas** e **Combinações cadastradas**.

Marque uma ou mais opções e confirme em **Adicionar selecionadas**. A seleção é preservada ao trocar de categoria ou buscar outro componente; cancelar ou pressionar Escape descarta a seleção pendente. Componentes já adicionados ficam sinalizados e não podem ser duplicados. O painel limita a seleção às vagas restantes no grupo de oito membros e mostra o motivo quando uma combinação cadastrada é incompatível.

Os cartões mostram o nome e a função de cada componente. Abra **Configurar** para editar os parâmetros; grupos cadastrados oferecem **Ver configuração** para consultar a cópia preservada. Os identificadores e os componentes internos das receitas ficam em **Ver detalhes** no painel.

## Configurações personalizadas

Nos detalhes de uma estratégia, **Criar configuração personalizada** salva parâmetros próprios sem alterar o catálogo. A lista oferece o filtro **Configurações personalizadas** e o painel de adição oferece uma categoria com o mesmo nome. A cópia incorporada mantém os valores salvos e o papel original do componente: filtros autorizam entradas, saídas participam das vendas e sinais podem iniciar operações. Uma composição formada apenas por filtros e saídas continua inválida.

No processamento, o painel **Configuração ou combinação salva** reúne receitas, combinações livres e configurações de estratégias de sinal. Configurações de filtros e saídas são reservadas para composições. A API persiste as configurações individuais com `kind: strategy`; snapshots de execução e cópias incorporadas permanecem independentes das edições no cadastro.

## Exclusão de configurações personalizadas

Antes de excluir uma configuração personalizada, o popup consulta todas as páginas de sessões, processamentos e combinações cadastradas. A confirmação fica desabilitada durante a consulta e quando há um processamento vinculado ou uma cópia incorporada em uma combinação, inclusive em grupos aninhados e no histórico de execuções. O vínculo direto do processamento usa o ID da configuração preservado no snapshot, mesmo após editar seu nome ou parâmetros.

As cópias incorporadas no contrato atual não contêm o identificador do cadastro de origem. Quando uma cópia da mesma estratégia base tem outro nome, a interface não consegue descartar um vínculo após edições e mantém a exclusão bloqueada, informando quais registros devem ser revisados. Configurações distintas identificadas diretamente nos processamentos não são confundidas apenas por usarem a mesma estratégia base.

Falhas na consulta também mantêm a confirmação desabilitada, com opção de tentar novamente. A verificação é repetida imediatamente antes de enviar a exclusão. Além da validação na interface web, a API aplica a mesma restrição na camada de armazenamento e retorna HTTP 409 com o código `CONFIGURATION_IN_USE` quando há vínculos ou cópias de origem incerta.
