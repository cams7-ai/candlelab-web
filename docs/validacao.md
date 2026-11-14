# Validação da implementação

Data: 14/11/2026.

## Executado

- Leitura da especificação e abertura dos nove PNGs de `images/`.
- Consulta ao README público do ReplayQuant para a distinção entre sinal, disponibilidade, preenchimento e resultado realizado/não realizado.
- Consulta à versão 5.2.0 do Lightweight Charts, seus tipos instalados, licença e aviso de atribuição.
- Instalação com Yarn 1.22.22 e geração de `yarn.lock`, incluindo `lightweight-charts@5.2.0`.
- `yarn test`: **31 testes aprovados**, em três arquivos. Cobertura funcional com mocks HTTP e testes do adaptador do gráfico; não é uma medição percentual de cobertura de código.
- `yarn build:demo`: TypeScript e build Vite aprovados, com chunk separado dos mocks.
- `yarn build`: TypeScript e build de produção aprovados, sem ativação dos mocks.
- `yarn format:check`: formatação aprovada.
- Servidor iniciado com `yarn demo`; `GET /` respondeu **HTTP 200**. O servidor de verificação foi encerrado ao final.

Os testes exercitam a transmissão dos bytes do arquivo multipart, consulta mínima, campos opcionais omitidos, datas UTC com segundos, limites inválidos, validações por linha/campo, taxa decimal exata, paginação e deduplicação, cancelamento HTTP, criação de sessão, parâmetros de uma estratégia nova publicada por catálogo, seleção da execução, atualização do resumo e histórico, reabertura pela URL, acompanhamento e encerramento do polling, falhas e retentativas, marcadores de sinal/fill em candles distintos, RSI e aquecimento, limpeza do gráfico e precisão dos valores exibidos.

## Limites e verificações pendentes

- A ferramenta de acesso ao navegador retornou **“The browser access host is unavailable”** ao tentar abrir `http://localhost:5173`. Assim, não houve inspeção visual em navegador nem comparação lado a lado com os PNGs. Permanecem pendentes desktop/celular, seletor aberto, abas de aquisição, desenho real do canvas, zoom e troca de processamento em navegador.
- O jsdom não renderiza o canvas. Os testes verificam as chamadas do adaptador à biblioteca real tipada, usando mocks para o desenho.
- A API real não foi disponibilizada. Não foram executados backtests reais nem validados CORS, OpenAPI e respostas do backend em execução.
- O arquivo histórico especificado no prompt não está no repositório. O caso real de 865 candles, com última abertura em `2026-08-22T00:00:00Z`, permanece pendente. A entrega inclui uma fixture sintética de 40 candles com 12 campos, independente desse arquivo.

## Conferência manual após disponibilizar o navegador/API

1. Rodar `yarn demo` e conferir `#/sessions`, `#/candles`, `#/sessions/new`, `#/sessions/demo-session/runs/new` e `#/sessions/demo-session`.
2. Abrir o seletor, buscar EMA, alternar para SMA + RSI e conferir parâmetros, resumo, séries e histórico. Alternar sinais e execuções separadamente.
3. Conferir as duas abas de aquisição, erros e importação de `public/candles-sinteticos.json`.
4. Repetir em largura móvel e com navegação pelo teclado.
5. Rodar `yarn dev` com a API real configurada e repetir o fluxo, inclusive recarga da sessão e importação do arquivo histórico especificado.
