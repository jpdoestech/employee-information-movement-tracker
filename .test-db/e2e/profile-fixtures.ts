import type { Locator, Page } from "@playwright/test";
const identifierSequences = new WeakMap<Page, number>();
export async function fillGovernmentIds(editor: Locator) {
  const sequence = identifierSequences.get(editor.page()) || 0;
  identifierSequences.set(editor.page(), sequence + 1);
  const previous = await editor
    .getByRole("tab", { selected: true })
    .innerText();
  await editor
    .getByRole("tab", { name: "Personal Information", exact: true })
    .click();
  for (const [label, value] of [
    ["BIR TIN", "012345678"],
    ["SSS Number", "0123456789"],
    ["PhilHealth PIN", "012345678901"],
    ["Pag-IBIG MID", "012345678901"],
  ])
    await editor
      .getByRole("textbox", {
        name: new RegExp(
          `^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?: \\*)?$`,
        ),
      })
      .fill(
        (BigInt(value) + BigInt(sequence))
          .toString()
          .padStart(value.length, "0"),
      );
  await editor.getByRole("tab", { name: previous, exact: true }).click();
}
