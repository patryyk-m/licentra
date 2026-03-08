import { toast } from 'sonner';

export async function performStepUp() {
  const password = window.prompt('confirm your password to continue');
  if (!password) {
    toast.error('action cancelled');
    return false;
  }
  const res = await fetch('/api/auth/step-up', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ password }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) {
    toast.error(json.message || 'password confirmation failed');
    return false;
  }
  return true;
}

export function isStepUpRequired(res, json) {
  return res.status === 403 && (json?.message || '').toLowerCase().includes('step-up');
}
