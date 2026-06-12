import { useEffect, useRef, useState } from 'react';
import { Check, Download, KeyRound, RefreshCw, Upload, User2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useApp } from '@/context/AppContext';
import * as api from '@/api/client';

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { profile, saveProfile, health, refresh, refreshApiKeyState, pushError } = useApp();
  const [form, setForm] = useState<Partial<api.Profile>>({});
  const [keyInput, setKeyInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Encrypted device sync.
  const [syncPass, setSyncPass] = useState('');
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const syncFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && profile) {
      setForm(profile);
      setKeyInput(api.getApiKey() ?? '');
      setSaved(false);
      setSyncMsg('');
    }
  }, [open, profile]);

  const syncReady = syncPass.length >= 8;

  const doSyncExport = async () => {
    setSyncBusy(true);
    setSyncMsg('');
    try {
      await api.syncExport(syncPass);
      setSyncMsg('Encrypted sync file downloaded — move it to your other device and import it there.');
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setSyncBusy(false);
    }
  };

  const doSyncImport = async (file: File | undefined) => {
    if (!file) return;
    setSyncBusy(true);
    setSyncMsg('');
    try {
      const r = await api.syncImport(file, syncPass);
      setSyncMsg(
        `Merged: +${r.workouts_added} workouts, +${r.checkins_added} check-ins, ` +
          `+${r.film_added} film sessions (${r.skipped} already here).`,
      );
      await refresh();
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setSyncBusy(false);
      if (syncFileRef.current) syncFileRef.current.value = '';
    }
  };

  const set = <K extends keyof api.Profile>(k: K, v: api.Profile[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const num = (v: string): number | null => (v === '' ? null : Number(v));

  const handleSave = async () => {
    setSaving(true);
    try {
      api.setApiKey(keyInput.trim() || null);
      refreshApiKeyState();
      await saveProfile(form);
      setSaved(true);
      setTimeout(() => onOpenChange(false), 600);
    } catch {
      pushError('Could not save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User2 className="h-4 w-4 text-brand-400" /> Athlete & Settings
          </DialogTitle>
          <DialogDescription>
            Your profile shapes every AI recommendation. The Claude key is stored
            only in this browser.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          {/* Profile */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name">
              <Input
                value={form.name ?? ''}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Your name"
              />
            </Field>
            <Field label="Primary event / position">
              <Input
                value={form.primary_event ?? ''}
                onChange={(e) => set('primary_event', e.target.value)}
                placeholder="e.g. Winger / 800m"
              />
            </Field>
            <Field label="Sport focus">
              <Select
                value={form.sport_focus ?? 'both'}
                onValueChange={(v) => set('sport_focus', v as api.SportFocus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="soccer">Soccer</SelectItem>
                  <SelectItem value="track">Track & Field</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Experience">
              <Select
                value={form.experience ?? 'intermediate'}
                onValueChange={(v) => set('experience', v as api.Experience)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="beginner">Beginner</SelectItem>
                  <SelectItem value="intermediate">Intermediate</SelectItem>
                  <SelectItem value="advanced">Advanced</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Age">
              <Input
                type="number"
                aria-label="Age"
                value={form.age ?? ''}
                onChange={(e) => set('age', num(e.target.value))}
              />
            </Field>
            <Field label="Weekly session target">
              <Input
                type="number"
                aria-label="Weekly session target"
                value={form.weekly_target ?? ''}
                onChange={(e) => set('weekly_target', Number(e.target.value) || 0)}
              />
            </Field>
            <Field label="Height (cm)">
              <Input
                type="number"
                aria-label="Height in centimetres"
                value={form.height_cm ?? ''}
                onChange={(e) => set('height_cm', num(e.target.value))}
              />
            </Field>
            <Field label="Weight (kg)">
              <Input
                type="number"
                aria-label="Weight in kilograms"
                value={form.weight_kg ?? ''}
                onChange={(e) => set('weight_kg', num(e.target.value))}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Target event (optional)">
              <Input
                value={form.target_event ?? ''}
                onChange={(e) => set('target_event', e.target.value)}
                placeholder="e.g. Regional final"
              />
            </Field>
            <Field label="Event date">
              <Input
                type="date"
                aria-label="Target event date"
                value={form.target_event_date ?? ''}
                onChange={(e) => set('target_event_date', e.target.value)}
              />
            </Field>
          </div>
          <p className="-mt-2 text-[11px] leading-snug text-zinc-500">
            With an event set, weekly plans periodise toward it — building far out,
            sharpening close in, tapering the final 1-2 weeks.
          </p>
          <Field label="Goals">
            <Textarea
              value={form.goals ?? ''}
              onChange={(e) => set('goals', e.target.value)}
              placeholder="e.g. Break 2:00 in the 800m and improve repeated-sprint ability for soccer."
              rows={2}
            />
          </Field>

          {/* API key */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                <KeyRound className="h-4 w-4 text-brand-400" /> Claude API key
              </span>
              {health?.ollama_available ? (
                <Badge variant="success">Ollama fallback ready</Badge>
              ) : (
                <Badge variant="warning">No local AI</Badge>
              )}
            </div>
            <Input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="sk-ant-…  (optional — leave blank to use local Ollama)"
            />
            <p className="mt-1.5 text-[11px] leading-snug text-zinc-500">
              Add a key for the highest-quality coaching. Without one, PitchPace
              uses your local Ollama model. Stored only in this browser.
            </p>
          </div>

          {/* Encrypted device sync */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                <RefreshCw className="h-4 w-4 text-brand-400" /> Sync between devices
              </span>
              <Badge variant="success">End-to-end encrypted</Badge>
            </div>
            <Input
              type="password"
              value={syncPass}
              onChange={(e) => setSyncPass(e.target.value)}
              placeholder="Sync passphrase (8+ characters — never stored)"
              aria-label="Sync passphrase"
            />
            <div className="mt-2 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={doSyncExport}
                disabled={!syncReady || syncBusy}
                className="flex-1"
              >
                <Download className="h-3.5 w-3.5" /> Export sync file
              </Button>
              <input
                ref={syncFileRef}
                type="file"
                accept=".ppsync"
                className="hidden"
                aria-label="Import sync file"
                onChange={(e) => doSyncImport(e.target.files?.[0])}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => syncFileRef.current?.click()}
                disabled={!syncReady || syncBusy}
                className="flex-1"
              >
                <Upload className="h-3.5 w-3.5" /> Import sync file
              </Button>
            </div>
            {syncMsg && <p className="mt-2 text-[11px] leading-snug text-brand-300">{syncMsg}</p>}
            <p className="mt-1.5 text-[11px] leading-snug text-zinc-500">
              Your data is AES-256 encrypted with this passphrase <em>before</em> it
              leaves the app, so the file can travel over any cloud drive, e-mail or
              USB stick you trust. Import on the other device with the same
              passphrase — existing entries are skipped, never overwritten. There is
              no PitchPace server in the middle.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saved ? (
              <>
                <Check className="h-4 w-4" /> Saved
              </>
            ) : saving ? (
              'Saving…'
            ) : (
              'Save settings'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
