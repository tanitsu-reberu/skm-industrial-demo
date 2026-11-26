import Link from "next/link";
import { getAdminSecuritySnapshot, revokeAdminSessionAction } from "@/lib/admin-security";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export async function AdminSecurity({ before, sessionBefore }: { before?: string; sessionBefore?: string }) {
  const snapshot = await getAdminSecuritySnapshot(before, sessionBefore);
  if (!snapshot) return null;
  return <section className="mt-12 space-y-5" aria-labelledby="admin-security-heading">
    <h2 id="admin-security-heading" className="font-display text-3xl font-semibold text-white">Безопасность</h2>
    <p className="text-sm text-muted">Сессии и события входа. Журнал хранится 90 дней; пароли и коды в него не записываются.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      {snapshot.sessions.map(session => <div key={session.token_hash} className="rounded-md border border-border p-4 text-sm text-muted">
        <p>{session.token_hash === snapshot.currentHash ? "Текущая сессия" : "Сессия администратора"}</p>
        <p>Создана: {formatDate(session.created_at)}</p>
        <p>До: {formatDate(session.expires_at)}</p>
        {session.revoked_at ? <p>Отозвана: {formatDate(session.revoked_at)}</p> : <form action={revokeAdminSessionAction} className="mt-3">
          <input type="hidden" name="sessionHash" value={session.token_hash} />
          <Button type="submit" variant="secondary">Завершить сессию</Button>
        </form>}
      </div>)}
    </div>
    {snapshot.sessionNext ? <Link className="text-sm underline" href={`/admin?sessionBefore=${snapshot.sessionNext}`}>Следующие сессии</Link> : null}
    <h3 className="text-xl font-semibold text-white">Журнал событий ({snapshot.total})</h3>
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-left text-sm text-muted">
        <thead><tr><th className="p-3">Время</th><th className="p-3">Событие</th><th className="p-3">Результат</th><th className="p-3">Объект</th><th className="p-3">Устройство</th></tr></thead>
        <tbody>{snapshot.events.map(event => <tr key={event.id} className="border-t border-border">
          <td className="p-3">{formatDate(event.created_at)}</td><td className="p-3">{event.event}</td>
          <td className="p-3">{event.outcome}</td><td className="max-w-40 truncate p-3" title={event.target ?? undefined}>{event.target ?? "—"}</td><td className="p-3">{event.agent ?? "—"}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {snapshot.next ? <Link className="text-sm underline" href={`/admin?auditBefore=${snapshot.next}`}>Более ранние события</Link> : null}
    {before || sessionBefore ? <Link className="ml-5 text-sm underline" href="/admin">К последним событиям</Link> : null}
  </section>;
}
