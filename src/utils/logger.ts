// Tiny timestamped logger. Intentionally dependency-free.

type Level = "debug" | "info" | "warn" | "error";

function ts(): string {
  return new Date().toISOString();
}

function emit(level: Level, args: unknown[]): void {
  const prefix = `[${ts()}] [${level.toUpperCase()}]`;
  if (level === "error") {
    console.error(prefix, ...args);
  } else if (level === "warn") {
    console.warn(prefix, ...args);
  } else {
    console.log(prefix, ...args);
  }
}

export const logger = {
  debug: (...args: unknown[]) => {
    if (process.env.DEBUG) emit("debug", args);
  },
  info: (...args: unknown[]) => emit("info", args),
  warn: (...args: unknown[]) => emit("warn", args),
  error: (...args: unknown[]) => emit("error", args),
};
