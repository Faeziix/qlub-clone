import * as React from "react";
import { cn } from "@/lib/utils";

interface BidiWrapperProps extends React.HTMLAttributes<HTMLDivElement> {
  dir: "rtl" | "ltr";
  children: React.ReactNode;
}

function BidiWrapper({ dir, children, className, ...props }: BidiWrapperProps) {
  return (
    <div dir={dir} className={cn(className)} {...props}>
      {children}
    </div>
  );
}

export { BidiWrapper };
export type { BidiWrapperProps };
