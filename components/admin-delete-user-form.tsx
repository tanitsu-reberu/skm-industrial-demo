"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteUserAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AdminDeleteUserForm({ userId }: { userId: number }) {
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await deleteUserAction(formData);
      setMessage(result.message);
    });
  }

  return (
    <form action={submit} className="mt-3 flex flex-col gap-2 sm:flex-row">
      <input type="hidden" name="userId" value={userId} />
      <Input name="confirmation" placeholder="Введите DELETE" />
      <Button type="submit" variant="outline" size="sm" disabled={isPending}>
        <Trash2 className="h-4 w-4" />
        Удалить
      </Button>
      {message ? <span className="self-center text-xs text-muted">{message}</span> : null}
    </form>
  );
}
