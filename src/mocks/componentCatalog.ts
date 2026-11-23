import type { Strategy } from "../types";

// Generated from the API reusable rule catalog.
export const componentCatalog: Strategy[] = [
  {
    id: "RSI_CONFIRMATION@1",
    name: "Confirmação RSI",
    parameters_schema: {
      additionalProperties: false,
      properties: {
        rsi_period: {
          default: 14,
          maximum: 10000,
          minimum: 1,
          title: "Rsi Period",
          type: "integer",
        },
        rsi_confirmation_min: {
          default: "50",
          maxLength: 40,
          pattern: "^-?\\d+(?:\\.\\d+)?$",
          title: "Confirmação mínima RSI",
          type: "string",
          "x-max": "100",
          "x-min": "0",
        },
      },
      title: "RSI_CONFIRMATIONParameters",
      type: "object",
    },
    defaults: {
      rsi_period: 14,
      rsi_confirmation_min: "50",
    },
    category: "individual",
    rules: "Permite compras com RSI igual ou acima do limiar.",
    limitations: "",
    required_data: [],
    combinable: true,
    composition_role: "filter",
    components: [],
  },
  {
    id: "GRID_REGIME@1",
    name: "Regime de grade ADX",
    parameters_schema: {
      additionalProperties: false,
      properties: {
        atr_period: {
          default: 14,
          maximum: 10000,
          minimum: 1,
          title: "Atr Period",
          type: "integer",
        },
        adx_limit: {
          default: "20",
          maxLength: 40,
          pattern: "^-?\\d+(?:\\.\\d+)?$",
          title: "ADX máximo",
          type: "string",
          "x-max": "100",
          "x-min": "0",
        },
        regime_action: {
          default: "filter",
          description:
            "Filtrar compras permite retomar. Desativar grade encerra a posição e impede novas compras na grade desta composição.",
          enum: ["filter", "disable_grid"],
          title: "Ação ao atingir o ADX máximo",
          type: "string",
          "x-enum-labels": {
            disable_grid: "Desativar grade",
            filter: "Filtrar compras",
          },
        },
      },
      title: "GRID_REGIMEParameters",
      type: "object",
    },
    defaults: {
      atr_period: 14,
      adx_limit: "20",
      regime_action: "filter",
    },
    category: "individual",
    rules:
      "Permite compras com ADX abaixo do limite; pode desativar permanentemente a grade da composição ao atingir o limite.",
    limitations: "",
    required_data: [],
    combinable: true,
    composition_role: "filter",
    components: [],
  },
  {
    id: "RANKING_CONFIRMATION@1",
    name: "Seleção por ranking",
    parameters_schema: {
      additionalProperties: false,
      properties: {
        auxiliary_json: {
          contentMediaType: "application/json",
          default: "[]",
          maxLength: 8388608,
          title: "Dados auxiliares JSON",
          type: "string",
        },
        top_n: {
          default: 3,
          maximum: 10000,
          minimum: 1,
          title: "Top N",
          type: "integer",
        },
        min_liquidity: {
          default: "1000000",
          maxLength: 40,
          pattern: "^-?\\d+(?:\\.\\d+)?$",
          title: "Liquidez mínima USDT",
          type: "string",
          "x-max": "1000000000000",
          "x-min": "0",
        },
        min_roc: {
          default: "0",
          maxLength: 40,
          pattern: "^-?\\d+(?:\\.\\d+)?$",
          title: "ROC mínimo (%)",
          type: "string",
          "x-max": "1000000",
          "x-min": "-100",
        },
      },
      title: "RANKING_CONFIRMATIONParameters",
      type: "object",
    },
    defaults: {
      auxiliary_json: "[]",
      top_n: 3,
      min_liquidity: "1000000",
      min_roc: "0",
    },
    category: "individual",
    rules:
      "Permite compras quando BTC está no ranking líquido; requer universo externo.",
    limitations: "",
    required_data: ["universe"],
    combinable: false,
    composition_role: "filter",
    components: [],
  },
  {
    id: "EMA_DIRECTION@1",
    name: "Direção EMA",
    parameters_schema: {
      additionalProperties: false,
      properties: {
        stop_pct: {
          default: "3",
          maxLength: 40,
          pattern: "^-?\\d+(?:\\.\\d+)?$",
          title: "Stop no fechamento (%)",
          type: "string",
          "x-max": "100",
          "x-min": "0.01",
        },
        short_window: {
          default: 8,
          maximum: 10000,
          minimum: 1,
          title: "Short Window",
          type: "integer",
        },
        long_window: {
          default: 21,
          maximum: 10000,
          minimum: 1,
          title: "Long Window",
          type: "integer",
        },
      },
      title: "EMA_DIRECTIONParameters",
      type: "object",
    },
    defaults: {
      stop_pct: "3",
      short_window: 8,
      long_window: 21,
    },
    category: "individual",
    rules:
      "EMA curta acima da longa, fechamento acima da curta e candle de alta; saída abaixo da longa.",
    limitations: "",
    required_data: [],
    combinable: true,
    composition_role: "signal",
    components: [],
  },
  {
    id: "ADX_CONFIRMATION@1",
    name: "Confirmação ADX",
    parameters_schema: {
      additionalProperties: false,
      properties: {
        atr_period: {
          default: 14,
          maximum: 10000,
          minimum: 1,
          title: "Atr Period",
          type: "integer",
        },
        adx_limit: {
          default: "25",
          maxLength: 40,
          pattern: "^-?\\d+(?:\\.\\d+)?$",
          title: "ADX mínimo",
          type: "string",
          "x-max": "100",
          "x-min": "0",
        },
      },
      title: "ADX_CONFIRMATIONParameters",
      type: "object",
    },
    defaults: {
      atr_period: 14,
      adx_limit: "25",
    },
    category: "individual",
    rules:
      "Permite compras somente com ADX acima do limiar, após aquecimento ADX/ATR.",
    limitations: "",
    required_data: [],
    combinable: true,
    composition_role: "filter",
    components: [],
  },
  {
    id: "BOLLINGER_RECOVERY@1",
    name: "Recuperação Bollinger",
    parameters_schema: {
      additionalProperties: false,
      properties: {
        stop_pct: {
          default: "3",
          maxLength: 40,
          pattern: "^-?\\d+(?:\\.\\d+)?$",
          title: "Stop no fechamento (%)",
          type: "string",
          "x-max": "100",
          "x-min": "0.01",
        },
        period: {
          default: 20,
          maximum: 10000,
          minimum: 1,
          title: "Period",
          type: "integer",
        },
        deviations: {
          default: "2",
          maxLength: 40,
          pattern: "^-?\\d+(?:\\.\\d+)?$",
          title: "Desvios Bollinger",
          type: "string",
          "x-max": "10",
          "x-min": "0.1",
        },
      },
      title: "BOLLINGER_RECOVERYParameters",
      type: "object",
    },
    defaults: {
      stop_pct: "3",
      period: 20,
      deviations: "2",
    },
    category: "individual",
    rules:
      "Retorno à banda inferior após fechamento abaixo dela; saída na média.",
    limitations: "",
    required_data: [],
    combinable: true,
    composition_role: "signal",
    components: [],
  },
  {
    id: "RSI_RECOVERY@1",
    name: "Recuperação RSI",
    parameters_schema: {
      additionalProperties: false,
      properties: {
        rsi_period: {
          default: 14,
          maximum: 10000,
          minimum: 1,
          title: "Rsi Period",
          type: "integer",
        },
        recovery: {
          default: "30",
          maxLength: 40,
          pattern: "^-?\\d+(?:\\.\\d+)?$",
          title: "Recuperação RSI",
          type: "string",
          "x-max": "99",
          "x-min": "1",
        },
      },
      title: "RSI_RECOVERYParameters",
      type: "object",
    },
    defaults: {
      rsi_period: 14,
      recovery: "30",
    },
    category: "individual",
    rules:
      "Permite compras no candle em que RSI cruza o limiar de recuperação.",
    limitations: "",
    required_data: [],
    combinable: true,
    composition_role: "filter",
    components: [],
  },
  {
    id: "VOLUME_CONFIRMATION@1",
    name: "Confirmação de volume",
    parameters_schema: {
      additionalProperties: false,
      properties: {
        volume_period: {
          default: 20,
          maximum: 10000,
          minimum: 1,
          title: "Volume Period",
          type: "integer",
        },
        volume_multiple: {
          default: "1",
          maxLength: 40,
          pattern: "^-?\\d+(?:\\.\\d+)?$",
          title: "Volume relativo mínimo",
          type: "string",
          "x-max": "100",
          "x-min": "0.1",
        },
      },
      title: "VOLUME_CONFIRMATIONParameters",
      type: "object",
    },
    defaults: {
      volume_period: 20,
      volume_multiple: "1",
    },
    category: "individual",
    rules:
      "Permite compras com volume maior que a média anterior multiplicada pelo limiar.",
    limitations: "",
    required_data: [],
    combinable: true,
    composition_role: "filter",
    components: [],
  },
  {
    id: "MACD_SIGNAL@1",
    name: "Sinal MACD",
    parameters_schema: {
      additionalProperties: false,
      properties: {
        stop_pct: {
          default: "3",
          maxLength: 40,
          pattern: "^-?\\d+(?:\\.\\d+)?$",
          title: "Stop no fechamento (%)",
          type: "string",
          "x-max": "100",
          "x-min": "0.01",
        },
      },
      title: "MACD_SIGNALParameters",
      type: "object",
    },
    defaults: {
      stop_pct: "3",
    },
    category: "individual",
    rules:
      "MACD12/26 cruza sinal9; saída abaixo do sinal ou na perda de força.",
    limitations: "",
    required_data: [],
    combinable: true,
    composition_role: "signal",
    components: [],
  },
  {
    id: "EMA_CONFIRMATION@1",
    name: "Preço acima da EMA",
    parameters_schema: {
      additionalProperties: false,
      properties: {
        ema_period: {
          default: 21,
          maximum: 10000,
          minimum: 1,
          title: "Ema Period",
          type: "integer",
        },
      },
      title: "EMA_CONFIRMATIONParameters",
      type: "object",
    },
    defaults: {
      ema_period: 21,
    },
    category: "individual",
    rules: "Permite compras com fechamento acima da EMA.",
    limitations: "",
    required_data: [],
    combinable: true,
    composition_role: "filter",
    components: [],
  },
  {
    id: "RSI_RANGE@1",
    name: "Faixa RSI",
    parameters_schema: {
      additionalProperties: false,
      properties: {
        rsi_period: {
          default: 14,
          maximum: 10000,
          minimum: 1,
          title: "Rsi Period",
          type: "integer",
        },
        rsi_min: {
          default: "40",
          maxLength: 40,
          pattern: "^-?\\d+(?:\\.\\d+)?$",
          title: "RSI mínimo",
          type: "string",
          "x-max": "100",
          "x-min": "0",
        },
        rsi_max: {
          default: "70",
          maxLength: 40,
          pattern: "^-?\\d+(?:\\.\\d+)?$",
          title: "RSI máximo",
          type: "string",
          "x-max": "100",
          "x-min": "0",
        },
      },
      title: "RSI_RANGEParameters",
      type: "object",
    },
    defaults: {
      rsi_period: 14,
      rsi_min: "40",
      rsi_max: "70",
    },
    category: "individual",
    rules: "Permite compras com RSI dentro da faixa inclusiva.",
    limitations: "",
    required_data: [],
    combinable: true,
    composition_role: "filter",
    components: [],
  },
  {
    id: "ATR_EXIT@1",
    name: "Saída trailing ATR",
    parameters_schema: {
      additionalProperties: false,
      properties: {
        stop_pct: {
          default: "3",
          maxLength: 40,
          pattern: "^-?\\d+(?:\\.\\d+)?$",
          title: "Stop no fechamento (%)",
          type: "string",
          "x-max": "100",
          "x-min": "0.01",
        },
        atr_period: {
          default: 14,
          maximum: 10000,
          minimum: 1,
          title: "Atr Period",
          type: "integer",
        },
        atr_multiple: {
          default: "2",
          maxLength: 40,
          pattern: "^-?\\d+(?:\\.\\d+)?$",
          title: "Trailing ATR",
          type: "string",
          "x-max": "20",
          "x-min": "0.1",
        },
      },
      title: "ATR_EXITParameters",
      type: "object",
    },
    defaults: {
      stop_pct: "3",
      atr_period: 14,
      atr_multiple: "2",
    },
    category: "individual",
    rules:
      "Vende ao fechar no trailing ATR anterior ou no stop percentual; atualiza o trailing após verificar a saída.",
    limitations: "",
    required_data: [],
    combinable: true,
    composition_role: "exit",
    components: [],
  },
];

export const recipeComponents: Record<
  string,
  NonNullable<Strategy["components"]>
> = {
  "SMA_RSI_FILTER@1": [
    {
      strategy_id: "SMA_CROSS@1",
      role: "signal",
    },
    {
      strategy_id: "RSI_CONFIRMATION@1",
      role: "filter",
    },
  ],
  "EMA_ADX_ATR@1": [
    {
      strategy_id: "EMA_DIRECTION@1",
      role: "signal",
    },
    {
      strategy_id: "ADX_CONFIRMATION@1",
      role: "filter",
    },
    {
      strategy_id: "ATR_EXIT@1",
      role: "exit",
    },
  ],
  "RSI_BOLLINGER@1": [
    {
      strategy_id: "BOLLINGER_RECOVERY@1",
      role: "signal",
    },
    {
      strategy_id: "RSI_RECOVERY@1",
      role: "filter",
    },
  ],
  "BREAKOUT_VOLUME_ATR@1": [
    {
      strategy_id: "BREAKOUT@1",
      role: "signal",
    },
    {
      strategy_id: "VOLUME_CONFIRMATION@1",
      role: "filter",
    },
    {
      strategy_id: "ATR_EXIT@1",
      role: "exit",
    },
  ],
  "MACD_EMA_RSI@1": [
    {
      strategy_id: "MACD_SIGNAL@1",
      role: "signal",
    },
    {
      strategy_id: "EMA_CONFIRMATION@1",
      role: "filter",
    },
    {
      strategy_id: "RSI_RANGE@1",
      role: "filter",
    },
  ],
  "GRID_ADX_ATR@1": [
    {
      strategy_id: "GRID_TRADING@1",
      role: "signal",
      parameter_overrides: { spacing_mode: "atr" },
    },
    {
      strategy_id: "GRID_REGIME@1",
      role: "filter",
      parameter_overrides: { regime_action: "disable_grid" },
    },
  ],
  "MOMENTUM_RANKING@1": [
    {
      strategy_id: "MOMENTUM@1",
      role: "signal",
    },
    {
      strategy_id: "RANKING_CONFIRMATION@1",
      role: "filter",
    },
  ],
};
