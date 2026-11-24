import type { ActionType } from '@vlab/contracts';
import { useMemo, useState, type KeyboardEvent } from 'react';
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
import { StageActionForm } from './ActionParameterForm';
import { Icon } from '../components/ui/Icon';
import { StageSetupDialog } from './StageSetupDialog';
import { BenchArrangeControls } from './BenchArrangeControls';
import { boundedOffset, type BenchOffsets, type BenchOffset } from './benchLayout';
import { placementOf, type SceneItem, type SceneModel } from './sceneModel';
import { itemPosition, itemBox, VIEW_W, BENCH_Y } from './lab2d/layout2d';
import { itemPosition3D } from './scene3d/layout3d';

/**
 * Shared visualization boundary and interaction controller. Both renderers receive the same scene
 * model and the same gesture handlers. Gestures resolve to existing typed engine actions through
 * `interaction/gestures`; the engine decides every outcome, and the drawing changes only when the
 * returned projection changes. Switching renderer changes presentation only.
 */
export function LaboratoryViewport({ model: projectedModel }: { model: SceneModel }) {
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
  const [toolbarTarget, setToolbarTarget] = useState<HTMLDivElement | null>(null);
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const [arrange, setArrange] = useState(false);
  const [offsets, setOffsets] = useState<BenchOffsets>({});
  const model = useMemo(
    () => ({ ...projectedModel, positionOffsets: offsets }),
    [projectedModel, offsets],
  );
  const move = (id: string, value: BenchOffset) =>
    setOffsets((old) => {
      const item = projectedModel.items.find((i) => i.id === id);
      if (!item || placementOf(item, projectedModel) !== 'bench') return old;
      const at = itemPosition(item, projectedModel),
        box = itemBox(item, 'bench');
      const [worldX, , worldZ] = itemPosition3D(item, projectedModel);
      const next = boundedOffset(value);
      const half = (box.w * at.s) / 2 + 8;
      return {
        ...old,
        [id]: {
          x: Math.max(
            (half - at.x) / 100,
            -4.5 - worldX,
            Math.min((VIEW_W - half - at.x) / 100, 4.5 - worldX, next.x),
          ),
          z: Math.max(
            (370 - at.y) / 60,
            -1.5 - worldZ,
            Math.min((BENCH_Y - at.y) / 60, 1.9 - worldZ, next.z),
          ),
        },
      };
    });

  const find = (id: string | null) => model.items.find((i) => i.id === id) ?? null;
  const held = find(heldId);
  const focused = focusedId !== closedFor ? find(focusedId) : null;
  const openForm = form && form.sequence === sequence ? form.type : null;
  const setupKind: Partial<Record<ActionType, SceneItem['kind']>> = {
    set_balance_sliders: 'balance',
    add_solid: 'reagent',
    remove_solid: 'reagent',
    add_water: 'wash_bottle',
    adjust_to_mark: 'volumetric_flask',
    apply_label: 'volumetric_flask',
  };
  const setupTarget =
    suggested && setupKind[suggested]
      ? model.items.find(
          (i) =>
            i.kind === setupKind[suggested] &&
            (i.kind !== 'volumetric_flask' || i.id === model.workingFlaskId),
        )
      : null;
  const setupAction = setupTarget ? suggested : null;
  const [anchor, setAnchor] = useState<readonly [number, number] | null>(null);

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
    if (arrange) {
      if (id !== BENCH_TARGET) pickItem(id);
      return;
    }
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
  const rendererProps = {
    model,
    onPick,
    label,
    heldItemId: heldId,
    onDrop,
    toolbarTarget,
    setupTargetId: setupTarget?.id ?? null,
    onSetupAnchor: setAnchor,
    arrange,
    onArrange: move,
  };
  const lab2d = <Laboratory2D {...rendererProps} />;

  return (
    <div className="scene-frame" onKeyDown={onKeyDown}>
      <div className="scene-frame__bar">
        <LaboratoryModeSwitcher value={labView} onChange={setLabView} />
        {!automatic && (
          <button
            type="button"
            className="button scene-frame__arrange"
            aria-pressed={arrange}
            aria-label={t(arrange ? 'ui.practice.action_mode' : 'ui.practice.arrange_mode')}
            title={t(arrange ? 'ui.practice.action_mode' : 'ui.practice.arrange_mode')}
            onClick={() => {
              setArrange((a) => !a);
              setHeldId(null);
              setForm(null);
            }}
          >
            <Icon name="move" size={20} />
          </button>
        )}
        <div className="scene-frame__presets" ref={setToolbarTarget} />
        <details className="bench-details">
          <summary>{t('ui.stage.text_description')}</summary>
          <div className="bench-details__content">
            <p className="scene-frame__caption">
              {t(automatic ? 'ui.stage.caption_automatic' : 'ui.stage.caption')}
            </p>
            {labView === '3d' && <p>{t('ui.lab.orbit_hint')}</p>}
            <BenchDescription model={model} />
          </div>
        </details>
      </div>
      <div ref={setStage} className={held ? 'lab-stage lab-stage--holding' : 'lab-stage'}>
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
        {setupAction && !openForm && !held && (
          <button
            type="button"
            className="lab-stage__setup-trigger"
            style={
              anchor
                ? {
                    left: `clamp(12px, ${anchor[0] * 100}%, calc(100% - 100px))`,
                    top: `clamp(12px, ${anchor[1] * 100}%, calc(100% - 52px))`,
                    right: 'auto',
                  }
                : undefined
            }
            data-setup-instrument={setupTarget?.id}
            aria-label={t('ui.stage.open_setup', { action: t(`exp04.action.${setupAction}`) })}
            title={t('ui.stage.open_setup', { action: t(`exp04.action.${setupAction}`) })}
            onClick={() => {
              if (setupTarget) pickItem(setupTarget.id);
              setForm({ type: setupAction, sequence });
            }}
          >
            <Icon name="settings" size={18} />
            <span>{t('ui.stage.setup')}</span>
          </button>
        )}
        {openForm && (
          <StageSetupDialog
            title={t(`exp04.action.${openForm}`)}
            stage={stage}
            onClose={() => setForm(null)}
          >
            <StageActionForm type={openForm} suggested={suggested === openForm} />
          </StageSetupDialog>
        )}
      </div>
      {arrange && (
        <BenchArrangeControls
          selected={focused && placementOf(focused, model) === 'bench' ? focused.id : ''}
          label={focused ? t(focused.nameKey) : t('ui.practice.instrument')}
          offsets={offsets}
          onMove={move}
          onReset={() => setOffsets({})}
        />
      )}
      {!automatic && (
        <StageDock
          model={model}
          focused={focused}
          held={held}
          form={null}
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
    </div>
  );
}
