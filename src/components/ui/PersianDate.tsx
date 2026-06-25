import * as React from "react";
import { cn } from "@/lib/utils";
import { formatJalaliDate, formatJalaliDateTime } from "@/lib/jalali";

interface PersianDateProps extends React.HTMLAttributes<HTMLTimeElement> {
  date: Date | string;
  withTime?: boolean;
}

function PersianDate({ date, withTime = false, className, ...props }: PersianDateProps) {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  const isoString = dateObj.toISOString();
  const formatted = withTime ? formatJalaliDateTime(dateObj) : formatJalaliDate(dateObj);

  return (
    <time
      dateTime={isoString}
      dir="rtl"
      className={cn("tabular-nums", className)}
      {...props}
    >
      {formatted}
    </time>
  );
}

export { PersianDate };
export type { PersianDateProps };
