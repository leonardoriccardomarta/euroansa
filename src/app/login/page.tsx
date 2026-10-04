"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowRight, AlertCircle } from "lucide-react";
import { loginAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const res = await loginAction(formData);
    if (res?.error) {
      setError(res.error);
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex max-w-md flex-col justify-center px-4 py-16">
        <div className="mb-8 flex items-center gap-3">
          <Image
            src="/favicon.jpg"
            alt=""
            width={44}
            height={44}
            className="h-11 w-11 rounded-xl shadow-md"
            priority
          />
          <div>
            <p className="text-lg font-bold text-slate-900">{APP_NAME}</p>
            <p className="text-sm text-slate-500">{APP_TAGLINE}</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-lg">
          <h1 className="text-2xl font-bold text-slate-900">Accedi</h1>
          <p className="mt-2 text-slate-600">
            Entra nella dashboard per gestire le pratiche
          </p>

          {error && (
            <div className="mt-4 flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertCircle className="h-5 w-5 shrink-0" />
              {error}
            </div>
          )}

          <form action={onSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold text-slate-700">
                Email
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="tuo@email.it"
                className="h-10 rounded-lg border-slate-300"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-semibold text-slate-700">
                Password
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="h-10 rounded-lg border-slate-300"
              />
            </div>
            <Button
              type="submit"
              className="h-10 w-full gap-2 rounded-lg bg-primary-600 font-semibold shadow-md hover:bg-primary-700"
              disabled={pending}
            >
              {pending ? "Accesso..." : "Accedi"}
              {!pending && <ArrowRight className="h-4 w-4" />}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
