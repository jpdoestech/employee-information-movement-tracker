import defaults from "./defaultFields.json";
import type { Field } from "../domain";
export const addressPrefixes = ["", "current_", "emergency_"] as const;
export const addressLabels = {
  "": "Home Address",
  current_: "Current Address",
  emergency_: "Emergency Address",
};
export const addressKeys = [
  "address",
  "province",
  "city_municipality",
  "barangay",
  "postal_code",
] as const;
export type AddressKey = (typeof addressKeys)[number];
export type AddressValue = Record<AddressKey, string | null>;
export const addressDefinitions = defaults;
export const relationshipOptions = defaults.find(
  (f) => f.key === "emergency_contact_relationship",
)!.options;
export function addressValue(
  values: Record<string, unknown>,
  prefix = "",
): AddressValue {
  return Object.fromEntries(
    addressKeys.map((key) => [
      key,
      typeof values[prefix + key] === "string" ? values[prefix + key] : null,
    ]),
  ) as AddressValue;
}
export function addressAccess(fields: Field[], editing: boolean, prefix = "") {
  return Object.fromEntries(
    addressKeys.map((key) => {
      const field = fields.find((f) => f.active && f.key === prefix + key);
      return [
        key,
        {
          visible:
            !!field &&
            (field.actions.includes("R") ||
              field.actions.includes(editing ? "U" : "C")),
          write: !!field?.actions.includes(editing ? "U" : "C"),
          clear: !!field?.actions.includes(editing ? "D" : "C"),
          required: !!field?.required,
        },
      ];
    }),
  ) as Record<
    AddressKey,
    { visible: boolean; write: boolean; clear: boolean; required: boolean }
  >;
}
