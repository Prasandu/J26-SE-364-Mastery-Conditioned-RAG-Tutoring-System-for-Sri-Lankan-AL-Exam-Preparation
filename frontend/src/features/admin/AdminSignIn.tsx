import { useState } from "react";

import { Button } from "@/components/Button";
import { Card, SectionHeading } from "@/components/Card";
import { readAdminKey, saveAdminKey } from "@/lib/teacher";

/** The same admin key used to generate model papers. One key, every admin screen. */
export function AdminSignIn({ onReady }: { onReady: () => void }) {
  const [key, setKey] = useState(readAdminKey());

  return (
    <Card className="mx-auto max-w-md">
      <SectionHeading>Admin</SectionHeading>
      <p className="text-sm text-slate-500">
        The key is the <code className="font-mono">ADMIN_API_KEY</code> from the service settings.
        It is forgotten when you close this tab.
      </p>

      <form
        className="mt-5 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (key.trim()) {
            saveAdminKey(key.trim());
            onReady();
          }
        }}
      >
        <div className="space-y-1">
          <label htmlFor="admin-key" className="block text-sm text-slate-600">
            Admin key
          </label>
          <input
            id="admin-key"
            type="password"
            autoComplete="off"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-brand-500 focus:outline-none"
          />
        </div>
        <Button type="submit" className="w-full">
          Continue
        </Button>
      </form>
    </Card>
  );
}
