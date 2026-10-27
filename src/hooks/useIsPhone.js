import { useEffect, useState } from "react";

const QUERY = "(max-width: 768px)";

function readIsPhone() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
}

/** True when the viewport is phone-narrow (max-width 768px). */
export default function useIsPhone() {
  const [isPhone, setIsPhone] = useState(readIsPhone);

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = () => setIsPhone(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return isPhone;
}
