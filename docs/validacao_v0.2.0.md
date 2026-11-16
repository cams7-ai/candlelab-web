# Validação — 0.2.0

Data: 16/11/2026. Prompt executado: [prompt_261116_v0.2.0.md](prompt_261116_v0.2.0.md).

- `yarn build`: TypeScript e build Vite aprovados.
- `yarn test`: **36 passed**, quatro arquivos. Inclui catálogo 12+6 com quatro legadas, edição/importação de JSON auxiliar, envio preservando strings decimais, erros locais de JSON/limites e exclusão dos fills ETH da escala de preço BTC.
- `yarn format:check`: aprovado.
- `git diff --check`: aprovado.
- Contrato do catálogo demo gerado a partir da API 0.2.0. Exemplos auxiliares sincronizados com os 40 candles de `public/candles-sinteticos.json`.
- API correspondente validada em HTTP real com as 18 estratégias, worker e MongoDB. A demonstração MSW permanece ilustrativa e não executa o motor financeiro.
- Inspeção visual em navegador **pendente**: o host de acesso ao navegador retornou `The browser access host is unavailable`. Não foi possível observar desktop/celular nem executar o fluxo visual completo conectado à API. Os fluxos de formulário foram verificados com Testing Library/MSW.

Node emitiu aviso experimental de `buffer.File` durante os testes. Nenhum erro de teste/build.

Veja [estrategias_v0.2.0.md](estrategias_v0.2.0.md) para os formatos de importação e limitações. Não se usaram marcadores retrospectivos do tutorial como resultados reais. As alterações estão no diretório de trabalho, sem commit nem publicação.
