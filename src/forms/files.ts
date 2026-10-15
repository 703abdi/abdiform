// File upload rules shared by the upload endpoint and the validator.

export const MAX_FILE_BYTES = 4 * 1024 * 1024; // stays under Vercel's 4.5 MB request limit

const ALLOWED: Record<string, string[]> = {
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  gif: ["image/gif"],
  webp: ["image/webp"],
  pdf: ["application/pdf"],
  txt: ["text/plain"],
  csv: ["text/csv", "application/vnd.ms-excel", "text/plain"],
  doc: ["application/msword"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  xls: ["application/vnd.ms-excel"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ppt: ["application/vnd.ms-powerpoint"],
  pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
};

export const ACCEPT_ATTR = Object.keys(ALLOWED).map((e) => `.${e}`).join(",");

export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  return base.replace(/[^\w.\- ()]/g, "_").slice(0, 120) || "file";
}

/** Extension must be allowed; the browser-reported type must agree (or be generic). */
export function fileAllowed(name: string, mime: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const types = ALLOWED[ext];
  if (!types) return false;
  return !mime || mime === "application/octet-stream" || types.includes(mime);
}

export const FILE_ANSWER = /^file:([0-9a-f-]{36}):(.{1,120})$/i;
export const fileAnswer = (id: string, name: string) => `file:${id}:${name}`;
export const parseFileAnswer = (v: unknown): { id: string; name: string } | null => {
  const m = typeof v === "string" ? FILE_ANSWER.exec(v) : null;
  return m ? { id: m[1], name: m[2] } : null;
};
