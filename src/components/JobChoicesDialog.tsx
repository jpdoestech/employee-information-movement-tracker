import { useState } from "react";
import type { Field } from "../domain";
import { mutate } from "../api";
import { fieldConfigurationError } from "../fieldConfiguration";
import { Dialog } from "./Dialog";
import { FloatingNotification } from "./FloatingNotification";

export function JobChoicesDialog({
  field,
  onClose,
  onSaved,
}: {
  field: Field;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initial = (field.options || []).join("\n");
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Dialog
      title={`Official ${field.label} choices`}
      onClose={onClose}
      isDirty={text !== initial}
      closeDisabled={busy}
    >
      <div className="dialog-body">
        <p>
          These choices are shared by PRFs, employee forms and imports.
          Temporary entries remain allowed and do not become official
          automatically.
        </p>
        <label>
          Official choices (one per line)
          <textarea
            rows={10}
            disabled={busy}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <p className="hint">
          Check spelling and consistency before adding a name. Removing a choice
          keeps recorded employee and PRF values. To link a temporary entry,
          choose its existing official name in the employee, PRF or import
          review.
        </p>
        {error && (
          <FloatingNotification onDismiss={() => setError("")}>
            {error}
          </FloatingNotification>
        )}
      </div>
      <footer>
        <button disabled={busy}>Cancel</button>
        <button
          className="primary"
          disabled={busy}
          onClick={async () => {
            const options = text
              .split("\n")
              .map((value) => value.trim())
              .filter(Boolean);
            const invalid = fieldConfigurationError({ ...field, options });
            if (invalid) {
              setError(invalid);
              return;
            }
            setBusy(true);
            setError("");
            try {
              await mutate("job_choices", {
                key: field.key,
                options,
                expected_version: field.row_version,
              });
              onSaved();
              onClose();
            } catch (error) {
              setError((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Save choices
        </button>
      </footer>
    </Dialog>
  );
}
