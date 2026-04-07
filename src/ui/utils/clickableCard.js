function isKeyboardActivation(event) {
  return event.key === "Enter" || event.key === " ";
}

export function getClickableCardProps({ onOpen, disabled = false, ariaLabel } = {}) {
  if (typeof onOpen !== "function" || disabled) {
    return {
      role: undefined,
      tabIndex: undefined,
      "aria-label": ariaLabel,
      onClick: undefined,
      onKeyDown: undefined,
    };
  }

  return {
    role: "button",
    tabIndex: 0,
    "aria-label": ariaLabel,
    onClick: (event) => {
      onOpen(event);
    },
    onKeyDown: (event) => {
      if (!isKeyboardActivation(event)) return;
      event.preventDefault();
      onOpen(event);
    },
  };
}

