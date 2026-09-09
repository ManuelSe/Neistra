interface BrandProps {
  variant?: "mark" | "lockup" | "icon";
  className?: string;
}

/** Decorative identity; its enclosing heading/control supplies accessible text. */
export function Brand({ variant = "mark", className = "" }: BrandProps) {
  const stem = `/brand/neistra-${variant}`;
  const light = variant === "mark" ? stem : `${stem}-light`;
  return (
    <span className={`brand-art brand-art-${variant} ${className}`} aria-hidden="true">
      <img className="brand-art-light" src={`${light}.svg`} alt="" draggable="false" />
      <img className="brand-art-dark" src={`${stem}-dark.svg`} alt="" draggable="false" />
    </span>
  );
}
