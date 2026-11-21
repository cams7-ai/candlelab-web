import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

export async function selectRunStrategy(identifier: string) {
  await userEvent.click(
    await screen.findByRole("button", { name: "Selecionar estratégia" }),
  );
  const dialog = within(
    screen.getByRole("dialog", { name: "Selecionar estratégia" }),
  );
  await userEvent.type(dialog.getByRole("searchbox"), identifier);
  await userEvent.click(dialog.getByRole("radio"));
  await userEvent.click(
    dialog.getByRole("button", { name: "Usar estratégia" }),
  );
}
