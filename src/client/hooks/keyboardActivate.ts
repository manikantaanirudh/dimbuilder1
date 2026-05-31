import type { KeyboardEvent } from "react";

/**
 * Returns an onKeyDown handler that activates a click handler on Enter/Space,
 * so elements with role="button" behave like native buttons for keyboard users.
 */
export function onActivate(handler: () => void) {
  return (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handler();
    }
  };
}
