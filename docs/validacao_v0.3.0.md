# Validação — CandleLab Web 0.3.0

Data: 19/11/2026. Implementação do [prompt](prompt_261119_v0.3.0.md), criado antes das alterações de código após análise dos dois projetos.

## Entrega

- Menu/rota **Combinações**, listagem, criação, edição e exclusão confirmada.
- Composição livre de 2–8 estratégias elegíveis com parâmetros próprios e regras independentes `all`/`any`; configuração salva de combinação publicada, inclusive JSON auxiliar quando exigido.
- **Novo processamento** mantém a execução direta e oferece seleção explícita do cadastro, enviando apenas `combination_id`. O cadastro iniciado pela sessão retorna com a seleção na URL.
- Histórico, comparação e PDF usam `combination_snapshot`. Indicadores prefixados de cada componente preservam painéis de osciladores, escala RSI 0–100 e limiares individuais.
- Demo com CRUD, restauração de dados antigos do navegador, persistência e snapshots. Os resultados do demo continuam sintéticos.

## Verificações executadas

- `yarn test`: **63 testes aprovados**, em seis arquivos. Inclui oito testes novos para cadastro/reabertura/edição/exclusão, preset/parâmetros/retorno à sessão, validação/falha recuperável, payload do processamento, snapshot após edição/exclusão, retentativa/seleção indisponível, navegação e separação/limiares de indicadores dos componentes. Regressões de importação, arquivos auxiliares, sessões, polling, exclusão, gráfico e PDF continuam aprovadas.
- `yarn build`: **aprovado**, TypeScript e Vite no modo API real.
- `yarn build:demo`: **aprovado**, executado separadamente do build normal. Ao final, `yarn build` foi executado novamente para deixar `dist/` integrado à API real.
- `yarn format:check`: **aprovado**, todos os arquivos cobertos pelo comando.
- `git diff --check`: sem erros de whitespace.

## Limites da verificação

O host de acesso ao navegador retornou `The browser access host is unavailable`; não foi possível inspecionar visualmente desktop/celular nesta sessão. Testes de UI usam jsdom/MSW e testes do gráfico verificam o adaptador do Lightweight Charts. Não foi feita publicação nem integração de navegador com MongoDB/Redis reais. A API foi validada separadamente com FastAPI TestClient, MongoDB simulado e worker, conforme `../candlelab-api/docs/validacao_v0.3.0.md`.

Atualize e reinicie API e worker para 0.3.0 juntamente com o frontend. Cadastros reais são compartilhados via MongoDB; o demo usa somente localStorage. Estratégias com ordens especiais e dados externos não compõem a carteira genérica; suas combinações publicadas continuam disponíveis como presets.
