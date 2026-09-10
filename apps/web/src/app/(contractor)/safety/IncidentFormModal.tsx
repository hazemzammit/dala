'use client';

import { Button, Card, FormField } from '@dala/ui-web';
import { XIcon } from '@phosphor-icons/react';
import { useState, type FormEvent } from 'react';

import { createSafetyIncident } from './actions';

import { createClient } from '@/lib/supabase/client';
import { useAsyncTransition } from '@/lib/useAsyncTransition';

const SEVERITY_OPTIONS: { value: 'minor' | 'moderate' | 'severe'; label: string }[] = [
  { value: 'minor', label: 'Mineur' },
  { value: 'moderate', label: 'Modéré' },
  { value: 'severe', label: 'Grave' },
];

// Mirrors apps/mobile/src/lib/pickerOptions.ts's INCIDENT_TYPE_OPTIONS —
// that file is mobile-app-local (not a shared package), so this list is
// duplicated rather than newly shared, matching how it already existed.
const INCIDENT_TYPE_OPTIONS = ['Chute', 'Coupure', 'Électrocution', 'Accident véhicule', 'Autre'];

export function IncidentFormModal({ onClose }: { onClose: () => void }) {
  const [description, setDescription] = useState('');
  const [incidentType, setIncidentType] = useState(INCIDENT_TYPE_OPTIONS[0]!);
  const [severity, setSeverity] = useState<'minor' | 'moderate' | 'severe'>('minor');
  const [location, setLocation] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useAsyncTransition();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (description.trim().length < 2) {
      setError('Description requise.');
      return;
    }

    startTransition(async () => {
      let photoPath: string | undefined;

      if (photoFile) {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const { data: profile } = await supabase
          .from('profiles')
          .select('active_org_id')
          .eq('id', user?.id ?? '')
          .single();

        if (profile?.active_org_id) {
          const path = `${profile.active_org_id}/safety/${Date.now()}-${photoFile.name}`;
          const { error: uploadError } = await supabase.storage
            .from('site-logs')
            .upload(path, photoFile);
          if (!uploadError) {
            photoPath = path;
          }
        }
      }

      const result = await createSafetyIncident({
        description,
        severity,
        incident_type: incidentType,
        location: location || undefined,
        photo_path: photoPath,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card raised className="w-full max-w-md p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-neutral-900">
            Signaler un incident
          </h2>
          <button
            onClick={onClose}
            className="rounded-control p-1 text-neutral-500 hover:bg-neutral-100"
            aria-label="Fermer"
          >
            <XIcon size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-neutral-900">Type d’incident</label>
            <select
              value={incidentType}
              onChange={(e) => setIncidentType(e.target.value)}
              className="rounded-control bg-neutral-0 focus:border-accent-600 border border-neutral-300 px-3 py-2.5 text-[15.5px] outline-none"
            >
              {INCIDENT_TYPE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <FormField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Décrivez ce qui s'est passé"
            required
          />

          <FormField
            label="Lieu (facultatif)"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Ex. Étage 2, façade nord"
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-neutral-900">Gravité</label>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as 'minor' | 'moderate' | 'severe')}
              className="rounded-control bg-neutral-0 focus:border-accent-600 border border-neutral-300 px-3 py-2.5 text-[15.5px] outline-none"
            >
              {SEVERITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-neutral-900">Photo (optionnel)</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
              className="text-sm text-neutral-700"
            />
          </div>

          {error && <p className="text-danger text-sm">{error}</p>}

          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" loading={isPending}>
              Enregistrer
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
