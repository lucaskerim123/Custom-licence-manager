'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '../../../lib/session';
import { setReleaseReview, validateRelease, archiveRelease } from '../../../lib/core/releases';

export type ReleaseCheck = { key: string; ok: boolean; message: string };\ntype ActionState = { ok: boolean; message: string; checks?: ReleaseCheck[]; checkedAt?: string };

const roles = ['owner', 'admin', 'operator'];

export async function runReleaseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    if (!roles.includes(user.role)) return { ok: false, message: 'You do not have permission to operate releases.' };
    const id = String(formData.get('id') || '').trim();
    const action = String(formData.get('action') || '').trim();
    if (!id) return { ok: false, message: 'Release ID is missing.' };

    if (action === 'validate') {
      const row = await validateRelease(id, user.id, user.email);
      if (!row) return { ok: false, message: 'Release not found.' };
      revalidatePath('/releases');
      revalidatePath('/releases/base');
      revalidatePath('/releases/' + id);
      const validation = row.manifest?.validation || {}; return { ok: validation.status === 'passed', message: validation.status === 'passed' ? 'Validation passed. Release is ready for technical approval.' : 'Validation completed with failures. Review the failed checks below.', checks: Array.isArray(validation.checks) ? validation.checks : [], checkedAt: validation.checked_at };
    }

    if (action === 'approve' || action === 'reject') {
      const reason = String(formData.get('reason') || '').trim();
      if (action === 'reject' && !reason) return { ok: false, message: 'A rejection reason is required.' };
      const row = await setReleaseReview(id, action === 'approve' ? 'approved' : 'rejected', user.id, user.email, reason || undefined);
      if (!row) return { ok: false, message: 'Release not found.' };
      revalidatePath('/releases');
      revalidatePath('/releases/base');
      revalidatePath('/releases/' + id);
      return { ok: true, message: action === 'approve' ? 'Technical approval recorded. Candidate is ready for Billing Store final review.' : 'Release rejected and held out of publication.' };
    }

    if (action === 'archive') {
      const row = await archiveRelease(id, true, user.id, user.email);
      if (!row) return { ok: false, message: 'Release not found.' };
      revalidatePath('/releases');
      revalidatePath('/releases/base');
      revalidatePath('/releases/' + id);
      return { ok: true, message: 'Release archived.' };
    }

    return { ok: false, message: 'Unsupported release action.' };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Release operation failed.', checks: [] };
  }
}
