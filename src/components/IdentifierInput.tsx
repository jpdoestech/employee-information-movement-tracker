import type { Field } from "../domain";
import {
  formatIdentifier,
  identifierGroups,
  normalizeIdentifier,
  mobileError,
} from "../identifiers";
import { governmentIdError } from "../governmentIds";
export function IdentifierInput({
  id,
  field,
  value,
  onChange,
}: {
  id: string;
  field: Field;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const groups = identifierGroups(field)!;
  const display = formatIdentifier(value, groups);
  const error =
    field.type === "phone"
      ? mobileError(value)
      : governmentIdError(field, value);
  return (
    <>
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        value={display}
        maxLength={groups.reduce((a, b) => a + b, 0) + 8}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-identifier-error` : undefined}
        onChange={(event) => {
          const input = event.currentTarget,
            position = input.selectionStart ?? input.value.length;
          let canonical = normalizeIdentifier(input.value),
            digitPosition = normalizeIdentifier(
              input.value.slice(0, position),
            ).length;
          // Backspace on an inserted separator must remove a digit, not trap the caret.
          if (
            (event.nativeEvent as InputEvent).inputType ===
              "deleteContentBackward" &&
            canonical === normalizeIdentifier(display) &&
            digitPosition > 0
          ) {
            canonical =
              canonical.slice(0, digitPosition - 1) +
              canonical.slice(digitPosition);
            digitPosition--;
          }
          onChange(canonical);
          requestAnimationFrame(() => {
            let digits = 0,
              caret = 0;
            while (caret < input.value.length && digits < digitPosition) {
              if (input.value[caret] !== "-") digits++;
              caret++;
            }
            if (document.activeElement === input)
              input.setSelectionRange(caret, caret);
          });
        }}
      />
      {error && (
        <small
          className="field-error"
          role="alert"
          id={`${id}-identifier-error`}
        >
          {error}
        </small>
      )}
    </>
  );
}
