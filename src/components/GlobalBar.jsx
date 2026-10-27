import { Icon } from "../icons.jsx";
import { globalLabel } from "../utils.js";

export default function GlobalBar({ name, children, titleRainbow = false }) {
  return (
    <div className="modbar gbar">
      <div className="gbar-title">
        <span>
          <Icon name={name} rainbow={titleRainbow} />
        </span>
        <b>{globalLabel(name)}</b>
      </div>
      {children ? <div className="gbar-tools">{children}</div> : null}
    </div>
  );
}
