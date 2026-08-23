'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAdminSession } from '@/lib/use-admin-session';

interface Note {
  id: string;
  body: string;
  author_admin_id: string;
  author_name: string;
  created_at: string;
  updated_at: string;
}

/**
 * apps/admin/src/components/ui/NotesPanel.tsx
 *
 * Admin remediation Tier 4.8 — internal notes / lightweight CRM layer.
 * Shared between OrgDetail.tsx and the new (admin)/users/[userId]/
 * UserDetail.tsx — same targetType/targetId contract either way. Every
 * admin role can add a note (Support included — see api/admin/notes/
 * route.ts's own header for why); edit/delete are gated per-note by the
 * route itself (author or Super Admin), so this component just hides the
 * buttons it already knows would 403 rather than duplicating that logic.
 */
export function NotesPanel({
  targetType,
  targetId,
}: {
  targetType: 'org' | 'user';
  targetId: string;
}) {
  const { data: session } = useAdminSession();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [newBody, setNewBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/admin/notes?targetType=${targetType}&targetId=${targetId}`);
    const data = await res.json();
    setNotes(data.notes ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetType, targetId]);

  async function addNote() {
    if (!newBody.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType, targetId, body: newBody }),
      });
      if (res.ok) {
        setNewBody('');
        await load();
      } else {
        const data = await res.json().catch(() => null);
        alert(data?.error ?? 'Impossible d’ajouter la note.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function saveEdit(noteId: string) {
    if (!editBody.trim()) return;
    const res = await fetch(`/api/admin/notes/${noteId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: editBody }),
    });
    if (res.ok) {
      setEditingId(null);
      await load();
    } else {
      const data = await res.json().catch(() => null);
      alert(data?.error ?? 'Modification impossible.');
    }
  }

  async function deleteNote(noteId: string) {
    if (!window.confirm('Supprimer cette note ?')) return;
    const res = await fetch(`/api/admin/notes/${noteId}`, { method: 'DELETE' });
    if (res.ok) {
      await load();
    } else {
      const data = await res.json().catch(() => null);
      alert(data?.error ?? 'Suppression impossible.');
    }
  }

  function canModify(note: Note): boolean {
    if (!session) return false;
    return session.admin.role === 'super_admin' || session.admin.id === note.author_admin_id;
  }

  return (
    <Card className="p-6">
      <h3 className="font-display text-base font-semibold text-neutral-900">Notes internes</h3>

      <div className="mt-3">
        <textarea
          value={newBody}
          onChange={(e) => setNewBody(e.target.value)}
          placeholder="Ajouter une note…"
          rows={2}
          className="rounded-control focus:border-accent-600 w-full border border-neutral-300 px-3 py-2.5 text-[15.5px] outline-none"
        />
        <div className="mt-2 flex justify-end">
          <Button
            onClick={addNote}
            disabled={!newBody.trim()}
            loading={submitting}
            className="px-3 py-1.5 text-xs"
          >
            Ajouter
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {loading ? (
          <p className="text-sm text-neutral-500">Chargement…</p>
        ) : notes.length === 0 ? (
          <p className="text-sm text-neutral-500">Aucune note pour le moment.</p>
        ) : (
          notes.map((note) => (
            <div key={note.id} className="border-t border-neutral-100 pt-3">
              {editingId === note.id ? (
                <>
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={2}
                    className="rounded-control focus:border-accent-600 w-full border border-neutral-300 px-3 py-2.5 text-[15.5px] outline-none"
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-xs font-medium text-neutral-500 hover:underline"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={() => saveEdit(note.id)}
                      className="text-accent-700 text-xs font-medium hover:underline"
                    >
                      Enregistrer
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="whitespace-pre-wrap text-sm text-neutral-900">{note.body}</p>
                  <div className="mt-1 flex items-center justify-between">
                    <p className="text-xs text-neutral-500">
                      {note.author_name} — {new Date(note.created_at).toLocaleString('fr-FR')}
                      {note.updated_at !== note.created_at && ' (modifiée)'}
                    </p>
                    {canModify(note) && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingId(note.id);
                            setEditBody(note.body);
                          }}
                          className="text-xs font-medium text-neutral-500 hover:underline"
                        >
                          Modifier
                        </button>
                        <button
                          onClick={() => deleteNote(note.id)}
                          className="text-danger text-xs font-medium hover:underline"
                        >
                          Supprimer
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
