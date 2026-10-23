import { expect, it } from "vitest";
import { normalizeInputs, normalizeText } from "../../src/inputNormalization";
import { combinedName } from "../../src/employeeForm";

it("cleans text without changing case, paragraphs, non-text values or exact inputs", () => {
  expect(normalizeText("  De   la\tCruz\u00a0 Jr.  ")).toBe("De la Cruz Jr.");
  expect(normalizeText("  First   paragraph \r\n\r\n Next\tline  ")).toBe(
    "First paragraph\n\nNext line",
  );
  expect(
    combinedName({
      last_name: "  De   la Cruz ",
      first_name: " Ana   Maria ",
      suffix: " III ",
    }),
  ).toBe("DE LA CRUZ, ANA MARIA III");
  const exact = {
    password: "  pass  word  ",
    duplicate_review: " token ",
    config: { search: " literal  spaces " },
  };
  expect(
    normalizeInputs({
      ...exact,
      name: "  IT   Operations ",
      values: [" QA  Lead ", 0, false, null],
    }),
  ).toEqual({
    ...exact,
    name: "IT Operations",
    values: ["QA Lead", 0, false, null],
  });
});
