import { useAuth } from "./use-auth";

const currencySymbols: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  NPR: "NPR ",
  INR: "₹",
  AED: "د.إ",
  SAR: "﷼",
  PKR: "Rs",
  BDT: "৳",
  CNY: "¥",
  JPY: "¥",
  CAD: "C$",
  AUD: "A$",
};

export function useCurrency() {
  const { user } = useAuth();
  const currencyCode = user?.currency || "USD";
  const symbol = currencySymbols[currencyCode] || "$";

  const formatCurrency = (amountInCents: number): string => {
    const amount = amountInCents / 100;
    return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatCurrencyShort = (amountInCents: number): string => {
    const amount = amountInCents / 100;
    return `${symbol}${amount.toLocaleString()}`;
  };

  return {
    currencyCode,
    symbol,
    formatCurrency,
    formatCurrencyShort,
  };
}
