import { useEffect, useState } from "react";
import { Icon } from "../icons.jsx";
import { APP_NAME } from "../utils.js";

const FEEDBACK_URL = "https://projectbinder.app/feedback";

const STEPS = [
  {
    logo: true,
    title: `Welcome to ${APP_NAME}`,
    points: [
      { icon: "plus", text: "Create projects, tasks, notes and more" },
      { icon: "stopwatch", text: "Track time spent on tasks and projects" },
      { icon: "asterisk", text: "Master board shows all tasks from all projects" },
    ],
  },
  {
    icon: "check",
    title: "Your binder is ready",
    points: [
      { icon: "Workspace", text: "Demo projects are now ready to explore" },
      { icon: "Trash", text: "Delete them whenever you like and create new ones" },
      {
        icon: "external",
        text: (
          <>
            Submit feedback at{" "}
            <a
              className="launch-link"
              href={FEEDBACK_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              projectbinder.app/feedback
            </a>
          </>
        ),
      },
    ],
  },
];

export default function LaunchDialog({ onStart }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const finish = () => onStart();
  const goNext = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.key !== "Enter") return;
      if (isLast) finish();
      else goNext();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [step, onStart]);

  return (
    <div className="ov" role="presentation">
      <div
        className="dlg launch-dlg"
        role="dialog"
        aria-modal="true"
        aria-label={`${APP_NAME} welcome — step ${step + 1} of ${STEPS.length}`}
      >
        <div className="dlg-content launch-body">
          <div className="launch-copy">
            <span className={"launch-hero" + (current.logo ? " is-logo" : "")}>
              {current.logo ? (
                <img
                  className="launch-logo"
                  src="/app-icon.png"
                  alt=""
                  width={56}
                  height={56}
                  draggable={false}
                />
              ) : (
                <Icon name={current.icon} size={28} />
              )}
            </span>
            <h2 className="launch-title">{current.title}</h2>
            {current.points ? (
              <ul className="launch-points">
                {current.points.map((item, i) => (
                  <li key={item.icon + i}>
                    <span className="launch-point-icon" aria-hidden="true">
                      <Icon name={item.icon} size={16} />
                    </span>
                    <span>{item.text}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="launch-footer">
            <div className="launch-dots" aria-hidden="true">
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={`launch-dot${i === step ? " is-active" : ""}`}
                />
              ))}
            </div>
            <div className="launch-actions">
              {isLast ? (
                <button type="button" className="launch-cta" onClick={finish}>
                  Let&apos;s go
                </button>
              ) : (
                <button type="button" className="launch-cta" onClick={goNext}>
                  Next
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
