import { Icon } from "../icons.jsx";
import { globalLabel } from "../utils.js";

export default function GlobalBar({ name, children }) {
  const rainbow = name === "Masterboard";
  return (
    <div className="modbar gbar">
      <div className="gbar-title">
        <span>
          <Icon name={name} rainbow={rainbow} />
        </span>
        <b>{globalLabel(name)}</b>
      </div>
      {children ? <div className="gbar-tools">{children}</div> : null}
    </div>
  );
}
