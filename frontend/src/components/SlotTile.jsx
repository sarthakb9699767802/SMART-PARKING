import { statusLabel } from "../utils/format";

/**
 * One parking bay. Used by the booking screen (select a free slot) and by the
 * owner slot manager (open a slot's details).
 */
export default function SlotTile({
  slot,
  selected = false,
  onSelect,
  disabled = false,
  stateLabel,
}) {
  return (
    <button
      type="button"
      className={`slot slot--${slot.status}${selected ? " slot--selected" : ""}`}
      onClick={() => onSelect?.(slot)}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`Slot ${slot.slot_number}, ${slot.slot_type}, ${stateLabel || statusLabel(slot.status)}`}
    >
      <span className="slot__number">{slot.slot_number}</span>
      <span className="slot__type">{slot.slot_type}</span>
      <span className="slot__state">
        <span className="slot__dot" aria-hidden="true" />
        {stateLabel || statusLabel(slot.status)}
      </span>
      {slot.reserved_until ? (
        <span className="slot__until">until {new Date(slot.reserved_until).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
      ) : null}
    </button>
  );
}
