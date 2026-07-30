import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getCajaFromInvoice(invoiceNumber: string | number): string {
  const num = typeof invoiceNumber === "number"
    ? invoiceNumber
    : parseInt(String(invoiceNumber).replace(/\D/g, ""), 10);
  if (isNaN(num) || num <= 0) return "";
  if (num >= 60252) return "CAJA 01";
  if (num >= 1160) return "CAJA 02";
  return "";
}
