import type { Locator } from "@playwright/test";
export async function fillGovernmentIds(editor: Locator) {
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
      .fill(value);
  await editor.getByRole("tab", { name: previous, exact: true }).click();
}
