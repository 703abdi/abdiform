// Shared Typeform-style class names for the admin (server- and client-safe).

/** Typeform-style buttons/inputs used across the admin. */
export const tf = {
  btn: "inline-flex items-center justify-center gap-1.5 rounded-md bg-[#262627] px-3.5 py-2 text-[14px] font-medium text-white hover:bg-black disabled:opacity-50",
  btnOutline:
    "inline-flex items-center justify-center gap-1.5 rounded-md border border-[#d4d4d4] bg-white px-3.5 py-2 text-[14px] font-medium text-[#262627] hover:bg-[#f5f5f5] disabled:opacity-50",
  btnGhost: "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[14px] text-[#262627] hover:bg-[#f0f0f0] disabled:opacity-50",
  btnDanger: "inline-flex items-center justify-center gap-1.5 rounded-md bg-[#c2331d] px-3.5 py-2 text-[14px] font-medium text-white hover:bg-[#a52a17] disabled:opacity-50",
  input:
    "w-full rounded-md border border-[#d4d4d4] bg-white px-3 py-2 text-[14px] text-[#262627] placeholder:text-[#8f8f8f] focus:border-[#262627] focus:outline-none",
  select:
    "rounded-md border border-[#d4d4d4] bg-white px-2.5 py-2 text-[14px] text-[#262627] focus:border-[#262627] focus:outline-none",
  label: "mb-1 block text-[13px] font-medium text-[#5e5e5e]",
};
