import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function isEqualArray(prev: any[], next: any[]): boolean {
  if (prev === next) return true;
  if (!prev || !next) return false;
  if (prev.length !== next.length) return false;
  if (prev.length === 0) return true;
  
  if (JSON.stringify(prev[0]) !== JSON.stringify(next[0])) return false;
  if (JSON.stringify(prev[prev.length - 1]) !== JSON.stringify(next[next.length - 1])) return false;
  
  return true;
}

