import { clsx, type ClassValue } from "clsx";
export const cn = (...values: ClassValue[]) => clsx(values);
export const formatTime = (ms: number) => `0:${String(Math.ceil(Math.max(0, ms) / 1000)).padStart(2, "0")}`;
