import { flushSync } from "react-dom";

/**
 * FLIP-animate two horizontally neighboring elements after applyOrder reorders the DOM.
 * @param {(key: string) => Element | null} findEl
 */
export function flipSwapHorizontal(findEl, leftKey, rightKey, applyOrder, swapClass) {
  const leftEl = findEl(leftKey);
  const rightEl = findEl(rightKey);
  if (!leftEl || !rightEl) {
    applyOrder();
    return;
  }

  const firstLeft = leftEl.getBoundingClientRect();
  const firstRight = rightEl.getBoundingClientRect();

  flushSync(() => {
    applyOrder();
  });

  const leftAfter = findEl(leftKey);
  const rightAfter = findEl(rightKey);
  if (!leftAfter || !rightAfter) return;

  const lastLeft = leftAfter.getBoundingClientRect();
  const lastRight = rightAfter.getBoundingClientRect();
  const dxLeft = firstLeft.left - lastLeft.left;
  const dxRight = firstRight.left - lastRight.left;
  if (dxLeft === 0 && dxRight === 0) return;

  leftAfter.classList.add(swapClass);
  rightAfter.classList.add(swapClass);
  leftAfter.style.transition = "none";
  rightAfter.style.transition = "none";
  leftAfter.style.transform = `translateX(${dxLeft}px)`;
  rightAfter.style.transform = `translateX(${dxRight}px)`;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      leftAfter.style.transition = "";
      rightAfter.style.transition = "";
      leftAfter.style.transform = "";
      rightAfter.style.transform = "";
      const cleanup = () => {
        leftAfter.classList.remove(swapClass);
        rightAfter.classList.remove(swapClass);
      };
      leftAfter.addEventListener("transitionend", cleanup, { once: true });
      window.setTimeout(cleanup, 380);
    });
  });
}
