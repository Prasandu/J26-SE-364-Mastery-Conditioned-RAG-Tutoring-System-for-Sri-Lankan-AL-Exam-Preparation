import type { ActionType } from '@vlab/contracts';
import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../store/StoreProvider';
import { BenchDescription, CanvasFallback } from './CanvasFallback';
import {
  BENCH_TARGET,
  menuAction,
  resolveGesture,
  type GestureResult,
} from './interaction/gestures';
import { StageDock } from './interaction/StageDock';
import { StageFeedback } from './interaction/StageFeedback';
import Laboratory2D from './lab2d/Laboratory2D';
import { LabCanvas } from './LabCanvas';
import { LaboratoryModeSwitcher } from './LaboratoryModeSwitcher';
import type { SceneItem, SceneModel } from './sceneModel';

/**
 * Shared visualization boundary and interaction controller. Both renderers receive the same scene
 * model and the same gesture handlers. Gestures resolve to existing typed engine actions through
 * `interaction/gestures`; the engine decides every outcome, and the drawing changes only when the
 * returned projection changes. Switching renderer changes presentation only.
 */
export function LaboratoryViewport({ model }: { model: SceneModel }) {
  const { t } = useTranslation();
  const labView = useSession((s) => s.labView);
  const setLabView = useSession((s) => s.setLabView);
  const pickItem = useSession((s) => s.pickItem);
  const dispatch = useSession((s) => s.dispatchLabAction);
  const busy = useSession((s) => s.ui.busy);
  const focusedId = useSession((s) => s.ui.focusedItem);
  const pending = useSession((s) => s.ui.pendingApparatus);
  const suggested = useSession((s) => s.session?.guidance.suggestedAction ?? null);
  const sequence = useSession((s) => s.session?.nextSequence ?? 0);
  const automatic = useSession((s) => s.session?.mode === 'automatic');

  const [heldId, setHeldId] = useState<string | null>(null);
  // A form opened from the scene closes itself once the engine records the next event.
  const [form, setForm] = useState<{ type: ActionType; sequence: number } | null>(null);
  const [notice, setNotice] = useState<{ key: string; id: number } | null>(null);
  const [closedFor, setClosedFor] = useState<string | null>(null);

  const find = (id: string | null) => model.items.find((i) => i.id === id) ?? null;
  const held = find(heldId);
  const focused = focusedId !== closedFor ? find(focusedId) : null;
  const openForm = form && form.sequence === sequence ? form.type : null;

  const run = (result: GestureResult) => {
    if (result.kind === 'dispatch') {
      setNotice(null);
      void dispatch(result.action);
    } else if (result.kind === 'form') {
      setNotice(null);
      setForm({ type: result.type, sequence });
    } else {
      setNotice((n) => ({ key: result.reasonKey, id: (n?.id ?? 0) + 1 }));
    }
  };
  const gesture = (sourceId: string, targetId: string) => {
    const source = find(sourceId);
    const target = targetId === BENCH_TARGET ? BENCH_TARGET : find(targetId);
    if (source && target) run(resolveGesture(source, target, model));
  };
  const onPick = (id: string) => {
    if (automatic) {
      if (id !== BENCH_TARGET) pickItem(id);
      return;
    }
    if (heldId) {
      setHeldId(null);
      if (id !== heldId) gesture(heldId, id);
      return;
    }
    if (id === BENCH_TARGET) return;
    setForm(null);
    setClosedFor(null);
    pickItem(id);
  };
  const onDrop = (sourceId: string, targetId: string) => {
    if (automatic) return;
    setHeldId(null);
    gesture(sourceId, targetId);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && (heldId || form)) {
      setHeldId(null);
      setForm(null);
    }
  };

  const label = t('ui.lab.scene_label');
  const rendererProps = { model, onPick, label, heldItemId: heldId, onDrop };
  const lab2d = <Laboratory2D {...rendererProps} />;

  return (
    <div className="scene-frame" onKeyDown={onKeyDown}>
      <div className="scene-frame__bar">
        <LaboratoryModeSwitcher value={labView} onChange={setLabView} />
        <p className="scene-frame__caption">
          {t(automatic ? 'ui.stage.caption_automatic' : 'ui.stage.caption')}
        </p>
      </div>
      <div className={held ? 'lab-stage lab-stage--holding' : 'lab-stage'}>
        {labView === '3d' ? (
          <LabCanvas
            {...rendererProps}
            fallback={(reason) => (
              <>
                <CanvasFallback reason={reason} />
                {lab2d}
              </>
            )}
          />
        ) : (
          lab2d
        )}
        <StageFeedback notice={notice} />
      </div>
      {!automatic && (
        <StageDock
          model={model}
          focused={focused}
          held={held}
          form={openForm}
          suggestedAction={suggested}
          busy={busy}
          onAction={(type: ActionType, item: SceneItem) =>
            run(menuAction(type, item, model, pending))
          }
          onPickUp={(item) => {
            setForm(null);
            setHeldId(item.id);
          }}
          onTarget={(targetId) => onPick(targetId)}
          onCancelHeld={() => setHeldId(null)}
          onClose={() => setClosedFor(focusedId)}
          onCloseForm={() => setForm(null)}
        />
      )}
      <details className="bench-details">
        <summary>{t('ui.stage.text_description')}</summary>
        <BenchDescription model={model} />
      </details>
    </div>
  );
}
