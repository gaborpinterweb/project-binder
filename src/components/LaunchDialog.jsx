import { useEffect, useState } from "react";
import { APP_NAME } from "../utils.js";

const GITHUB_URL = "https://github.com/gaborpinterweb/project-binder";

const STEPS = [
  {
    title: `Welcome to ${APP_NAME}`,
    text: `${APP_NAME} is an inventory for your projects with task boards, timelogs, notes and more. To get started, let's go through the main features of the app.`,
  },
  {
    title: "Create projects with unique colors",
    text: "All projects have their own unique colors. All project items - like Tasks - inherit the project's color.",
  },
  {
    title: "See all tasks on your Master board",
    text: "Master board shows all your tasks across all your projects and task boards in a single view.",
  },
  {
    title: "Everything is offline",
    text: "Your data stays on this device. Export a backup anytime from Settings → Data.",
  },
  {
    title: "... and there's much more!",
    text: "We've created some demo projects so you can look around. Feel free to delete them when you're ready.",
    link: { href: GITHUB_URL, label: "Visit GitHub" },
  },
];

export default function LaunchDialog({ onStart }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const goNext = () => {
    if (isLast) onStart();
    else setStep((s) => s + 1);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.key !== "Enter") return;
      if (step === STEPS.length - 1) onStart();
      else setStep((s) => s + 1);
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
            <h2 className="launch-title">{current.title}</h2>
            {current.text && <p className="launch-text">{current.text}</p>}
            {current.link && (
              <a
                className="launch-link"
                href={current.link.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {current.link.label}
              </a>
            )}
          </div>
          <div className="launch-dots" aria-hidden="true">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`launch-dot${i === step ? " is-active" : ""}`}
              />
            ))}
          </div>
        </div>
        <div className="dlg-controls launch-controls">
          <button type="button" className="launch-cta" onClick={goNext}>
            {isLast ? "Let's get started" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
