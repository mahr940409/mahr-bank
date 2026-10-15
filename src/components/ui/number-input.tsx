import * as React from "react";
import { cn } from "@/lib/utils";

interface NumberInputProps extends Omit<React.ComponentProps<"input">, "onChange" | "value" | "type"> {
  value: string;
  onChange: (value: string) => void;
}

function formatWithDots(raw: string): string {
  // Remove everything except digits and comma
  const clean = raw.replace(/[^\d,]/g, "");
  const [intPart, ...rest] = clean.split(",");
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  if (rest.length > 0) {
    return `${formatted},${rest.join("").slice(0, 2)}`;
  }
  return formatted;
}

function rawToNumber(formatted: string): string {
  // Strip dots, replace comma with dot for internal value
  return formatted.replace(/\./g, "").replace(",", ".");
}

const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  ({ className, value, onChange, placeholder = "0", ...props }, ref) => {
    // Convert internal numeric string (e.g. "1234.56") to display format
    const toDisplay = (val: string): string => {
      if (!val) return "";
      const num = parseFloat(val);
      if (isNaN(num)) return val;
      const parts = val.split(".");
      const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
      if (parts.length > 1) {
        return `${intPart},${parts[1]}`;
      }
      return intPart;
    };

    const [display, setDisplay] = React.useState(() => toDisplay(value));

    React.useEffect(() => {
      // Sync if external value changes
      const currentRaw = rawToNumber(display);
      if (currentRaw !== value) {
        setDisplay(toDisplay(value));
      }
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const formatted = formatWithDots(e.target.value);
      setDisplay(formatted);
      const raw = rawToNumber(formatted);
      onChange(raw === "" ? "" : raw);
    };

    return (
      <input
        type="text"
        inputMode="decimal"
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        value={display}
        onChange={handleChange}
        placeholder={placeholder}
        {...props}
      />
    );
  },
);
NumberInput.displayName = "NumberInput";

export { NumberInput };
