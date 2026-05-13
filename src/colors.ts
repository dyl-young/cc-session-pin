const useColor = process.stdout.isTTY && process.env.NO_COLOR !== "1";

const wrap = (open: string, close: string) => (s: string) =>
  useColor ? `\x1b[${open}m${s}\x1b[${close}m` : s;

export const bold = wrap("1", "22");
export const dim = wrap("2", "22");
export const green = wrap("32", "39");
export const cyan = wrap("36", "39");
export const yellow = wrap("33", "39");
