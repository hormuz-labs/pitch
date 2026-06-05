import { IoTrashOutline } from "react-icons/io5";
import type { ComponentProps } from "react";

export interface Button35Props extends ComponentProps<"button"> {}

export const Button35 = ({ className, children, ...props }: Button35Props) => {
  return (
    <button
      className={`from-destructive via-destructive/60 to-destructive focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 bg-transparent bg-gradient-to-r [background-size:200%_auto] text-white hover:bg-transparent hover:bg-[99%_center] flex items-center justify-center gap-2 px-3 py-2 h-[38px] rounded-lg border border-transparent cursor-pointer transition-all text-sm font-medium ${className || ""}`}
      {...props}
    >
      <IoTrashOutline className="shrink-0" size={15} />
      {children || <span>Delete</span>}
    </button>
  );
};

export default Button35;
