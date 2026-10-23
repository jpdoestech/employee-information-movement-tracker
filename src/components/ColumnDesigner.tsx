import { FloatingNotification } from "./FloatingNotification";
import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowUp,
  ArrowDown,
  Pin,
  ShieldCheck,
  LockKeyhole,
  Columns3,
  EyeOff,
  GripVertical,
} from "lucide-react";
import { FieldTypeIcon } from "./FieldTypeIcon";
import { Dialog } from "./Dialog";
import { SearchFilterPicker } from "./SearchFilterPicker";
import {
  defaultColumns,
  moveColumnGroup,
  reconcileLayout,
  type Field,
  type Layout,
} from "../domain";
export function ColumnDesigner({
  layout,
  fields,
  onApply,
  onClose,
  rowNumbersAllowed,
}: {
  layout: Layout;
  fields: Field[];
  onApply: (draft: Layout, name: string) => Promise<void>;
  onClose: () => void;
  rowNumbersAllowed: boolean;
}) {
  const [storedDraft, setDraft] = useState(() =>
      reconcileLayout(structuredClone(layout), fields),
    ),
    [name, setName] = useState("My employee view"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [tab, setTab] = useState("order"),
    [selected, setSelected] = useState<string[]>([]),
    [dragging, setDragging] = useState<string[]>([]),
    [drop, setDrop] = useState<{ key: string; after: boolean } | null>(null),
    [announcement, setAnnouncement] = useState("");
  const tabId = useId(),
    list = useRef<HTMLOListElement>(null);
  const gesture = useRef<{
    keys: string[];
    x: number;
    y: number;
    startX: number;
    startY: number;
    active: boolean;
    drop: { key: string; after: boolean } | null;
  } | null>(null);
  const frame = useRef<number | null>(null);
  // Apply current permissions/eligibility to existing views and open drafts.
  const draft = reconcileLayout(storedDraft, fields);
  const selection = draft.columns.filter((key) => selected.includes(key));
  function stopDrag() {
    gesture.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    setDragging([]);
    setDrop(null);
  }
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && gesture.current) {
        event.preventDefault();
        event.stopImmediatePropagation();
        stopDrag();
        setAnnouncement("Column drag cancelled.");
      }
    };
    window.addEventListener("keydown", escape, true);
    return () => {
      window.removeEventListener("keydown", escape, true);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);
  function reorder(columns: string[]) {
    setDraft({
      ...draft,
      columns,
      pinned: columns.filter((key) => draft.pinned.includes(key)),
    });
  }
  function locateDrop(x: number, y: number, keys: string[]) {
    const element = document
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>("[data-column-key]");
    const key = element?.dataset.columnKey;
    return element &&
      list.current?.contains(element) &&
      key &&
      !keys.includes(key)
      ? {
          key,
          after:
            y >
            element.getBoundingClientRect().top +
              element.getBoundingClientRect().height / 2,
        }
      : null;
  }
  function trackDrag() {
    const current = gesture.current,
      region = list.current;
    if (!current || !region) return;
    if (current.active) {
      const bounds = region.getBoundingClientRect();
      if (current.x >= bounds.left && current.x <= bounds.right) {
        const delta =
          current.y < bounds.top + 32
            ? -7
            : current.y > bounds.bottom - 32
              ? 7
              : 0;
        if (delta) region.scrollTop += delta;
      }
      const next = locateDrop(current.x, current.y, current.keys);
      if (
        next?.key !== current.drop?.key ||
        next?.after !== current.drop?.after
      ) {
        current.drop = next;
        setDrop(next);
      }
    }
    frame.current = requestAnimationFrame(trackDrag);
  }
  const governmentFields = fields.filter(
    (f) =>
      f.active &&
      f.list_eligible &&
      f.actions.includes("R") &&
      f.validation?.government_id_digits,
  );
  useEffect(() => {
    if (tab === "government" && !governmentFields.length) setTab("order");
  }, [tab, governmentFields.length]);
  function toggleColumn(key: string) {
    const columns = draft.columns.includes(key)
      ? draft.columns.filter((k) => k !== key)
      : [...draft.columns, key];
    setDraft({
      ...draft,
      columns,
      pinned: draft.pinned.filter((k) => columns.includes(k)),
    });
  }
  const options = fields
    .filter((f) => f.active && f.list_eligible && f.actions.includes("R"))
    .map((f) => ({
      id: f.key,
      label: f.label,
      context: `${f.group_name}${f.sensitivity === "restricted" ? " · Restricted" : ""}`,
      field_type: f.validation?.government_id_digits ? "government_id" : f.type,
    }));
  return (
    <Dialog
      title="Customize Columns"
      onClose={onClose}
      wide
      className="column-designer-dialog"
      isDirty={
        JSON.stringify(draft) !==
          JSON.stringify(reconcileLayout(layout, fields)) ||
        name !== "My employee view"
      }
    >
      <div className="dialog-body column-designer">
        <div className="column-designer-toolbar">
          <div className="column-visibility">
            <span>Visible columns</span>
            <SearchFilterPicker
              mode="multiple"
              label="Visible columns"
              selectionSummary
              options={options}
              value={draft.columns}
              onChange={(columns) =>
                setDraft({
                  ...draft,
                  columns,
                  pinned: draft.pinned.filter((k) => columns.includes(k)),
                })
              }
            />
          </div>
        </div>
        <div
          role="tablist"
          aria-label="Column customization"
          className="column-tabs"
        >
          {[
            { id: "order", label: "Column order", Icon: Columns3 },
            ...(governmentFields.length
              ? [
                  {
                    id: "government",
                    label: "Government IDs",
                    Icon: ShieldCheck,
                  },
                ]
              : []),
            { id: "settings", label: "View settings", Icon: Pin },
          ].map(({ id, label, Icon }, index, tabs) => (
            <button
              type="button"
              key={id}
              id={`${tabId}-${id}-tab`}
              role="tab"
              aria-label={label}
              aria-selected={tab === id}
              aria-controls={`${tabId}-${id}-panel`}
              tabIndex={tab === id ? 0 : -1}
              onClick={() => {
                stopDrag();
                setTab(id);
              }}
              onKeyDown={(event) => {
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? tabs.length - 1
                      : event.key === "ArrowRight"
                        ? (index + 1) % tabs.length
                        : event.key === "ArrowLeft"
                          ? (index + tabs.length - 1) % tabs.length
                          : undefined;
                if (next !== undefined) {
                  event.preventDefault();
                  stopDrag();
                  setTab(tabs[next].id);
                  document
                    .getElementById(`${tabId}-${tabs[next].id}-tab`)
                    ?.focus();
                }
              }}
            >
              <Icon size={15} aria-hidden="true" />
              <span className="column-tab-full-label">{label}</span>
              <span className="column-tab-short-label">
                {id === "order"
                  ? "Order"
                  : id === "settings"
                    ? "Settings"
                    : label}
              </span>
            </button>
          ))}
        </div>
        <section
          role="tabpanel"
          id={`${tabId}-settings-panel`}
          aria-labelledby={`${tabId}-settings-tab`}
          hidden={tab !== "settings"}
          className="column-tab-panel column-view-settings"
        >
          <label>
            Saved view name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
            />
          </label>
          <label className="row-number-preference">
            <input
              type="checkbox"
              disabled={!rowNumbersAllowed}
              checked={rowNumbersAllowed && draft.showRowNumbers !== false}
              onChange={(event) =>
                setDraft({ ...draft, showRowNumbers: event.target.checked })
              }
            />
            Show row numbers{" "}
            <small>
              {rowNumbersAllowed
                ? "Fixed first column"
                : "Disabled by the superadmin"}
            </small>
          </label>
        </section>
        {governmentFields.length > 0 && (
          <div
            role="tabpanel"
            id={`${tabId}-government-panel`}
            aria-labelledby={`${tabId}-government-tab`}
            hidden={tab !== "government"}
            className="column-tab-panel"
          >
            <section
              className="government-column-settings"
              aria-label="Government ID columns"
            >
              <div className="government-column-heading">
                <h3>
                  <ShieldCheck size={15} aria-hidden="true" /> Government IDs
                </h3>
                <span>
                  <LockKeyhole size={12} aria-hidden="true" /> Explicit Read
                  access only · optional
                </span>
              </div>
              <div className="government-column-choices">
                {governmentFields.map((field) => (
                  <label key={field.key}>
                    <input
                      type="checkbox"
                      checked={draft.columns.includes(field.key)}
                      onChange={() => toggleColumn(field.key)}
                    />
                    <span>
                      {field.label}
                      <small>
                        {field.validation!.government_id_digits} digits
                      </small>
                    </span>
                  </label>
                ))}
              </div>
            </section>
          </div>
        )}
        <section
          className="column-order column-tab-panel"
          role="tabpanel"
          id={`${tabId}-order-panel`}
          aria-labelledby={`${tabId}-order-tab`}
          hidden={tab !== "order"}
        >
          <div className="column-selection-toolbar">
            <label>
              <input
                type="checkbox"
                aria-label="Select all columns to move"
                checked={
                  draft.columns.length > 0 &&
                  selection.length === draft.columns.length
                }
                ref={(node) => {
                  if (node)
                    node.indeterminate =
                      selection.length > 0 &&
                      selection.length < draft.columns.length;
                }}
                onChange={(event) =>
                  setSelected(event.target.checked ? draft.columns : [])
                }
              />
              {selection.length ? `${selection.length} selected` : "Select all"}
            </label>
            {selection.length > 0 && (
              <div>
                <button
                  type="button"
                  aria-label="Move selected columns up"
                  disabled={draft.columns.indexOf(selection[0]) === 0}
                  onClick={() => {
                    const first = Math.min(
                      ...selection.map((key) => draft.columns.indexOf(key)),
                    );
                    reorder(
                      moveColumnGroup(
                        draft.columns,
                        selection,
                        draft.columns[first - 1],
                      ),
                    );
                    setAnnouncement(`${selection.length} columns moved up.`);
                  }}
                >
                  <ArrowUp size={15} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="Move selected columns down"
                  disabled={
                    Math.max(
                      ...selection.map((key) => draft.columns.indexOf(key)),
                    ) ===
                    draft.columns.length - 1
                  }
                  onClick={() => {
                    const last = Math.max(
                      ...selection.map((key) => draft.columns.indexOf(key)),
                    );
                    reorder(
                      moveColumnGroup(
                        draft.columns,
                        selection,
                        draft.columns[last + 1],
                        true,
                      ),
                    );
                    setAnnouncement(`${selection.length} columns moved down.`);
                  }}
                >
                  <ArrowDown size={15} aria-hidden="true" />
                </button>
                <button type="button" onClick={() => setSelected([])}>
                  Deselect
                </button>
                <button
                  type="button"
                  aria-label="Hide selected columns"
                  onClick={() => {
                    const columns = draft.columns.filter(
                      (key) => !selection.includes(key),
                    );
                    setDraft({
                      ...draft,
                      columns,
                      pinned: draft.pinned.filter((key) =>
                        columns.includes(key),
                      ),
                    });
                    setSelected([]);
                  }}
                >
                  <EyeOff size={15} aria-hidden="true" />
                  Hide
                </button>
              </div>
            )}
            {!selection.length && (
              <small className="column-summary">
                {draft.columns.length} columns · {draft.pinned.length} pinned
              </small>
            )}
          </div>
          <p className="sr-only" id={`${tabId}-drag-help`}>
            Select several columns, then drag any selected handle to move them
            together.
          </p>
          <p className="sr-only" role="status" aria-live="polite">
            {announcement}
          </p>
          <ol
            ref={list}
            className="column-list"
            aria-label="Column order"
            aria-describedby={`${tabId}-drag-help`}
          >
            {draft.columns.map((k, index) => (
              <li
                key={k}
                data-column-key={k}
                className={`${selection.includes(k) ? "column-selected" : ""} ${dragging.includes(k) ? "column-dragging" : ""} ${drop?.key === k ? (drop.after ? "column-drop-after" : "column-drop-before") : ""}`}
              >
                <input
                  type="checkbox"
                  aria-label={`Select ${options.find((o) => o.id === k)?.label || k} to move`}
                  checked={selection.includes(k)}
                  onChange={(event) =>
                    setSelected(
                      event.target.checked
                        ? [...selection, k]
                        : selection.filter((key) => key !== k),
                    )
                  }
                />
                <button
                  type="button"
                  className="column-drag-handle"
                  aria-label={`Drag ${k}`}
                  title="Drag this column or the selected columns"
                  aria-pressed={dragging.includes(k)}
                  onPointerDown={(event) => {
                    if (busy || event.button !== 0) return;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    gesture.current = {
                      keys: selection.includes(k)
                        ? draft.columns.filter((key) => selection.includes(key))
                        : [k],
                      x: event.clientX,
                      y: event.clientY,
                      startX: event.clientX,
                      startY: event.clientY,
                      active: false,
                      drop: null,
                    };
                    frame.current = requestAnimationFrame(trackDrag);
                  }}
                  onPointerMove={(event) => {
                    const current = gesture.current;
                    if (!current) return;
                    current.x = event.clientX;
                    current.y = event.clientY;
                    if (
                      !current.active &&
                      Math.hypot(
                        current.x - current.startX,
                        current.y - current.startY,
                      ) > 6
                    ) {
                      current.active = true;
                      setDragging(current.keys);
                      setAnnouncement(`Moving ${current.keys.length} columns.`);
                    }
                  }}
                  onPointerUp={(event) => {
                    const current = gesture.current;
                    const target =
                      current &&
                      locateDrop(event.clientX, event.clientY, current.keys);
                    if (current?.active && target) {
                      reorder(
                        moveColumnGroup(
                          draft.columns,
                          current.keys,
                          target.key,
                          target.after,
                        ),
                      );
                      setAnnouncement(`${current.keys.length} columns moved.`);
                    }
                    stopDrag();
                  }}
                  onPointerCancel={stopDrag}
                  onLostPointerCapture={stopDrag}
                >
                  <GripVertical size={16} aria-hidden="true" />
                </button>
                <span className="column-number">{index + 1}</span>
                <FieldTypeIcon
                  type={options.find((o) => o.id === k)?.field_type || "system"}
                />
                <div
                  className="column-label"
                  title={options.find((o) => o.id === k)?.label}
                >
                  <strong>{options.find((o) => o.id === k)?.label}</strong>
                  <small
                    className="column-group-label"
                    title={options.find((o) => o.id === k)?.context}
                  >
                    {options.find((o) => o.id === k)?.context}
                  </small>
                </div>
                <div className="column-row-actions">
                  {fields.find((f) => f.key === k)?.sensitivity ===
                    "restricted" && (
                    <LockKeyhole
                      size={13}
                      className="column-restricted-icon"
                      aria-label="Restricted field"
                    />
                  )}
                  <button
                    aria-pressed={draft.pinned.includes(k)}
                    aria-label={`Pin ${k}`}
                    title={`${draft.pinned.includes(k) ? "Unpin" : "Pin"} ${options.find((o) => o.id === k)?.label || k} (maximum two pinned)`}
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        pinned: draft.pinned.includes(k)
                          ? draft.pinned.filter((c) => c !== k)
                          : [...draft.pinned, k].slice(-2),
                      })
                    }
                  >
                    <Pin size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ol>
          {!draft.columns.length && (
            <p className="column-empty">
              <Columns3 size={16} aria-hidden="true" /> Select columns to build
              your view.
            </p>
          )}
        </section>
        {error && (
          <FloatingNotification onDismiss={() => setError("")}>
            {error}
          </FloatingNotification>
        )}
      </div>
      <footer>
        <button
          className="column-reset"
          aria-label="Clear custom column layout"
          onClick={() =>
            setDraft(
              reconcileLayout(
                {
                  ...layout,
                  columns: defaultColumns.filter((k) =>
                    options.some((o) => o.id === k),
                  ),
                  pinned: ["employee_number", "name"],
                },
                fields,
              ),
            )
          }
        >
          Reset to default
        </button>
        <button onClick={onClose}>Cancel</button>
        <button
          className="primary"
          disabled={busy || !draft.columns.length || !name.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              await onApply(draft, name);
              onClose();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Saving…" : "Apply & Save"}
        </button>
      </footer>
    </Dialog>
  );
}
