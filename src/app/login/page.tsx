"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/login/actions";
import { Button, Input } from "@/components/ui";

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <form action={action} className="w-full max-w-sm space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Tawakkul Forms</h1>
          <p className="text-sm text-slate-500">Admin login</p>
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-xs font-medium text-slate-600">Password</label>
          <Input id="password" name="password" type="password" autoFocus required autoComplete="current-password" />
        </div>
        {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
        <Button type="submit" disabled={pending} className="w-full">{pending ? "Checking..." : "Log in"}</Button>
      </form>
    </div>
  );
}
