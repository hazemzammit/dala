'use server';

import type { Project } from '@dala/shared-types';
import {
  createProjectSchema,
  updateProjectSchema,
  type CreateProjectInput,
  type UpdateProjectInput,
} from '@dala/validation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';

type ProjectMutationResult =
  { success: true; project: Project } | { success: false; error: string };
type DeleteProjectResult = { success: true; projectId: string } | { success: false; error: string };

const deleteProjectSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
});

export async function createProject(input: CreateProjectInput): Promise<ProjectMutationResult> {
  const parsed = createProjectSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Données invalides.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Session expirée, reconnectez-vous.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('active_org_id')
    .eq('id', user.id)
    .single();
  if (!profile?.active_org_id) {
    return { success: false, error: 'Aucune organisation active.' };
  }

  const { data, error } = await supabase
    .from('projects')
    .insert({
      lead_org_id: profile.active_org_id,
      name: parsed.data.name,
      client_name: parsed.data.client_name ?? null,
      address: parsed.data.address ?? null,
      budget_total: parsed.data.budget_total ?? null,
      created_by: user.id,
    })
    .select('*');

  if (error || !data || data.length === 0) {
    return { success: false, error: 'Impossible de créer le chantier. Vérifiez vos droits.' };
  }

  revalidatePath('/projects');
  return { success: true, project: data[0] };
}

export async function updateProject(input: UpdateProjectInput): Promise<ProjectMutationResult> {
  const parsed = updateProjectSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Données invalides.' };
  }

  const supabase = await createClient();
  const { id, version, ...fields } = parsed.data;

  const { data, error } = await supabase
    .from('projects')
    .update({
      ...(fields.name !== undefined && { name: fields.name }),
      ...(fields.client_name !== undefined && { client_name: fields.client_name }),
      ...(fields.address !== undefined && { address: fields.address }),
      ...(fields.budget_total !== undefined && { budget_total: fields.budget_total }),
      version: version + 1,
    })
    .eq('id', id)
    .eq('version', version)
    .select('*');

  if (error) {
    return { success: false, error: 'Impossible de modifier le chantier. Vérifiez vos droits.' };
  }
  if (!data || data.length === 0) {
    return {
      success: false,
      error: 'Ce chantier a été modifié entre-temps. Rechargez la page avant de réessayer.',
    };
  }

  revalidatePath('/projects');
  return { success: true, project: data[0] };
}

export async function deleteProject(input: {
  id: string;
  version: number;
}): Promise<DeleteProjectResult> {
  const parsed = deleteProjectSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Données invalides.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('projects')
    .update({ deleted_at: new Date().toISOString(), version: parsed.data.version + 1 })
    .eq('id', parsed.data.id)
    .eq('version', parsed.data.version)
    .select('id');

  if (error) {
    return { success: false, error: 'Impossible de supprimer le chantier. Vérifiez vos droits.' };
  }
  if (!data || data.length === 0) {
    return {
      success: false,
      error: 'Ce chantier a été modifié entre-temps. Rechargez la page avant de réessayer.',
    };
  }

  revalidatePath('/projects');
  return { success: true, projectId: parsed.data.id };
}
