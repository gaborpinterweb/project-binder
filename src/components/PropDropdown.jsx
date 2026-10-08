import Dropdown from "./Dropdown.jsx";
import { Icon } from "../icons.jsx";

export function PropAffix({ kind }) {
  return (
    <span className="prop-affix" aria-hidden="true">
      <Icon name={kind} size={12} />
    </span>
  );
}

export function closePropDrops() {
  document.querySelectorAll(".dlg .prop-dd").forEach((dd) => {
    dd.classList.remove("open");
    const pop = dd.querySelector(".pop");
    if (pop) pop.style.display = "none";
  });
}

/** Dialog property dropdown — thin wrapper around Dropdown. */
export default function PropDropdown({
  children,
  options,
  value,
  onChange,
  renderOption,
  className,
  sections,
}) {
  return (
    <Dropdown
      className={"prop-dd" + (className ? " " + className : "")}
      buttonClassName="prop-dd-btn"
      options={options}
      value={value}
      onChange={onChange}
      renderOption={renderOption}
      sections={sections}
      caret={false}
    >
      {children}
      <PropAffix kind="caret" />
    </Dropdown>
  );
}
