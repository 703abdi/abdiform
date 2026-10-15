"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { unlockFormAction } from "@/app/apply/[slug]/actions";

export default function PasswordGate({ slug, title }: { slug: string; title: string }) {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#fff", fontFamily: "system-ui, sans-serif" }}>
      <form
        style={{ width: "100%", maxWidth: 420 }}
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await unlockFormAction(slug, pw);
            if (r.ok) router.refresh();
            else setErr(r.error ?? "Wrong password.");
          });
        }}
      >
        <h1 style={{ fontSize: 26, fontWeight: 400, color: "#000", margin: "0 0 6px" }}>{title}</h1>
        <p style={{ color: "#555", margin: "0 0 22px" }}>This form is password protected.</p>
        <input
          autoFocus
          type="password"
          aria-label="Password"
          placeholder="Enter the password"
          value={pw}
          onChange={(e) => { setPw(e.target.value); setErr(null); }}
          style={{ width: "100%", border: 0, borderBottom: "1px solid #bbb", fontSize: 24, padding: "6px 0 10px", outline: "none", background: "transparent" }}
        />
        {err && <p role="alert" style={{ color: "#be123c", marginTop: 12 }}>{err}</p>}
        <button disabled={pending || !pw} style={{ marginTop: 22, background: "#0445AF", color: "#fff", border: 0, borderRadius: 4, padding: "8px 18px", fontSize: 18, cursor: "pointer", opacity: pending || !pw ? 0.6 : 1 }}>
          {pending ? "Checking..." : "Unlock"}
        </button>
      </form>
    </div>
  );
}
