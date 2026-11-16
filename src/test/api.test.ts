import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { api, apiBase, allPages, ApiError, request } from "../api";
import {
  binanceInput,
  candleDatasetName,
  datasetName,
  decimal,
  iso,
  parameterValue,
  percentToRate,
  rateToPercent,
} from "../utils";
import { server } from "./setup";
import { candles, dataset } from "../mocks/fixtures";
import type { Candle } from "../types";
describe("fronteira HTTP e decimais", () => {
  it("gera nome em UTC para conjuntos Binance e mantém nomes salvos", () => {
    expect(
      candleDatasetName(
        "BTCUSDT",
        "1m",
        Date.parse("2026-11-13T13:00:00Z"),
        Date.parse("2026-11-13T18:00:00Z"),
      ),
    ).toBe("btcusdt_1m_2026-11-13T1300Z_2026-11-13T1800Z");
    expect(datasetName({ ...dataset, name: "meu arquivo.json" })).toBe(
      "meu arquivo.json",
    );
    expect(datasetName(dataset)).toBe(
      "btcusdt_5m_2026-08-19T0000Z_2026-08-19T1455Z",
    );
  });
  it.each([
    ["0,1", "0.001"],
    ["0.00000001", "0.0000000001"],
    ["12.34", "0.1234"],
    ["100", "1"],
    ["0", "0"],
  ])("converte %s%% exatamente para %s", (input, expected) => {
    expect(percentToRate(input)).toBe(expected);
    expect(percentToRate(rateToPercent(expected))).toBe(expected);
  });
  it("preserva todos os dígitos financeiros", () => {
    expect(decimal("1000000000000,123456789012345678")).toBe(
      "1000000000000.123456789012345678",
    );
  });
  it("envia consulta mínima sem opcionais", async () => {
    let body: unknown;
    server.use(
      http.post(apiBase + "/datasets/binance", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(dataset);
      }),
    );
    await api.binance(binanceInput("BTCUSDT", "5m", "", "", ""));
    expect(body).toEqual({ symbol: "BTCUSDT", interval: "5m" });
  });
  it("envia datas UTC com segundos e limite inteiro", async () => {
    let body: unknown;
    server.use(
      http.post(apiBase + "/datasets/binance", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(dataset);
      }),
    );
    await api.binance(
      binanceInput(
        "BTCUSDT",
        "5m",
        "2026-08-19T00:00",
        "2026-08-22T00:00:00",
        "1000",
      ),
    );
    expect(body).toEqual({
      symbol: "BTCUSDT",
      interval: "5m",
      startTime: "2026-08-19T00:00:00Z",
      endTime: "2026-08-22T00:00:00Z",
      limit: 1000,
    });
    expect(iso("2026-08-19T00:00:00Z")).toBe("2026-08-19T00:00:00Z");
  });
  it.each(["0", "1001", "1.5", "abc"])("recusa limite inválido %s", (limit) =>
    expect(() => binanceInput("BTCUSDT", "5m", "", "", limit)).toThrow(
      "limite",
    ),
  );
  it("recusa datas invertidas", () =>
    expect(() =>
      binanceInput("BTCUSDT", "5m", "2026-08-22T00:00", "2026-08-19T00:00", ""),
    ).toThrow("início"));
  it("envia o arquivo original multipart sem recodificação", async () => {
    let text = "";
    let contentType = "";
    server.use(
      http.post(apiBase + "/datasets", async ({ request }) => {
        contentType = request.headers.get("content-type")!;
        const data = await request.formData();
        expect(data.get("symbol")).toBe("BTCUSDT");
        expect(data.get("interval")).toBe("5m");
        text = await (data.get("file") as File).text();
        return HttpResponse.json(dataset);
      }),
    );
    const original =
      '[ [1787097600000,"64000.0000","64010","63990","64001","2",1787097899999,"128000",4,"1","64000","0"] ]';
    await api.upload(
      new File([original], "candles.json", { type: "application/json" }),
      "BTCUSDT",
      "5m",
    );
    expect(text).toBe(original);
    expect(contentType).toContain("multipart/form-data; boundary=");
  });
  it("preserva erros por linha e campo da API", async () => {
    server.use(
      http.post(apiBase + "/datasets", () =>
        HttpResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Linha inválida",
              details: { line: 3, field: "close" },
            },
          },
          { status: 422 },
        ),
      ),
    );
    await expect(
      api.upload(new File(["[]"], "bad.json"), "BTCUSDT", "5m"),
    ).rejects.toMatchObject({
      status: 422,
      body: { error: { details: { line: 3, field: "close" } } },
    });
  });
  it("mescla todas as páginas e elimina duplicatas por timestamp", async () => {
    let calls = 0;
    server.use(
      http.get(apiBase + "/example", ({ request }) => {
        calls++;
        return HttpResponse.json(
          new URL(request.url).searchParams.has("cursor")
            ? { items: [candles[1], candles[2]], next_cursor: null }
            : { items: [candles[0], candles[1]], next_cursor: "next" },
        );
      }),
    );
    const result = await allPages<Candle>("/example", undefined, (c) =>
      String(c.open_time_ms),
    );
    expect(result).toEqual(candles.slice(0, 3));
    expect(calls).toBe(2);
  });
  it("detecta cursores repetidos", async () => {
    server.use(
      http.get(apiBase + "/example", () =>
        HttpResponse.json({ items: [], next_cursor: "same" }),
      ),
    );
    await expect(allPages("/example")).rejects.toThrow("cursor");
  });
  it("cancela requisições antigas", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      request("/sessions", { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
  it("valida tipos e limites do catálogo", () => {
    expect(
      parameterValue("0,123456789012345678", { type: "string", minimum: 0 }),
    ).toBe("0.123456789012345678");
    expect(() => parameterValue("1.5", { type: "integer" })).toThrow("inteiro");
    expect(() =>
      parameterValue("101", { type: "string", maximum: 100 }),
    ).toThrow("limites");
  });
  it("mantém o código de erro HTTP", async () => {
    await expect(request("/sessions/missing")).rejects.toBeInstanceOf(ApiError);
  });
});
