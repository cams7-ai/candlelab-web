import { useState } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { JsonParameterInput } from "../components/JsonParameterInput";

const original = '[{"open_time_ms":60000}]';
function Field() {
  const [value, setValue] = useState(original);
  return (
    <JsonParameterInput
      label="Dados auxiliares JSON"
      schema={{
        type: "string",
        contentMediaType: "application/json",
        maxLength: 1000,
      }}
      value={value}
      onChange={setValue}
    />
  );
}
function file(raw: string) {
  const result = new File([raw], "ranking.json", { type: "application/json" });
  Object.defineProperty(result, "text", {
    value: async () => raw,
    configurable: true,
  });
  return result;
}

it.each([
  ["{", "JSON inválido"],
  ["[]", "lista JSON não vazia"],
  ["{}", "lista JSON não vazia"],
])(
  "rejeita %s, preserva o campo e permite importar novamente",
  async (raw, message) => {
    render(<Field />);
    const input = screen.getByLabelText("Importar dados auxiliares JSON");
    await userEvent.upload(input, file(raw));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByLabelText("Dados auxiliares JSON")).toHaveValue(
      original,
    );
    const valid = '[{"open_time_ms":120000,"roc":"0.1234567890123456789"}]';
    await userEvent.upload(input, file(valid));
    await waitFor(() =>
      expect(screen.getByLabelText("Dados auxiliares JSON")).toHaveValue(valid),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  },
);

it("rejeita arquivo acima de 8 MiB antes da leitura", async () => {
  render(<Field />);
  const large = file(original);
  Object.defineProperty(large, "size", { value: 8 * 1024 * 1024 + 1 });
  const read = vi.fn();
  Object.defineProperty(large, "text", { value: read });
  await userEvent.upload(
    screen.getByLabelText("Importar dados auxiliares JSON"),
    large,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("excede 8 MiB");
  expect(read).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Dados auxiliares JSON")).toHaveValue(original);
});

it("preserva edição manual feita durante a leitura do arquivo", async () => {
  render(<Field />);
  let finish!: (value: string) => void;
  const slow = file(original);
  Object.defineProperty(slow, "text", {
    value: () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
  });
  await userEvent.upload(
    screen.getByLabelText("Importar dados auxiliares JSON"),
    slow,
  );
  expect(screen.getByRole("status")).toHaveTextContent("Lendo arquivo");
  const manual = '[{"open_time_ms":180000}]';
  fireEvent.change(screen.getByLabelText("Dados auxiliares JSON"), {
    target: { value: manual },
  });
  await act(async () => finish(original));
  expect(screen.getByLabelText("Dados auxiliares JSON")).toHaveValue(manual);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.queryByText(/Arquivo carregado/)).not.toBeInTheDocument();
});
