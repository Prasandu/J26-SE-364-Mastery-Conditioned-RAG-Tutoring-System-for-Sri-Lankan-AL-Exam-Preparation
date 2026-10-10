import { ActionSchema, type ActionType } from '@vlab/contracts';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { UNIT_LABEL } from '../lib/format';
import { useSession } from '../store/StoreProvider';

/**
 * One form per engine action. Forms only collect the learner's input and build the typed action;
 * the contract schema validates it. Invalid input is reported, never silently repaired.
 */

type FormErrorKey =
  | 'ui.form.invalid_number'
  | 'ui.form.choose_option'
  | 'ui.form.choose_apparatus'
  | 'ui.form.invalid';

const toNumber = (raw: string): number => (raw.trim() === '' ? Number.NaN : Number(raw));

function useActionSubmit() {
  const dispatch = useSession((s) => s.dispatchLabAction);
  const busy = useSession((s) => s.ui.busy);
  const [error, setError] = useState<FormErrorKey | null>(null);
  const submit = (raw: unknown, check?: () => FormErrorKey | null) => {
    const problem = check?.() ?? null;
    if (problem) return setError(problem);
    const parsed = ActionSchema.safeParse(raw);
    if (!parsed.success) return setError('ui.form.invalid');
    setError(null);
    void dispatch(parsed.data);
  };
  return { error, submit, busy };
}

function Choice<T extends string>({
  legendKey,
  options,
  value,
  onChange,
  name,
}: {
  legendKey: string;
  options: readonly { value: T; labelKey: string }[];
  value: T | null;
  onChange: (v: T) => void;
  name: string;
}) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <fieldset className="choice">
      <legend>{t(legendKey)}</legend>
      {options.map((o) => (
        <div className="check" key={o.value}>
          <input
            type="radio"
            id={`${id}-${o.value}`}
            name={`${name}-${id}`}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
          />
          <label htmlFor={`${id}-${o.value}`}>{t(o.labelKey)}</label>
        </div>
      ))}
    </fieldset>
  );
}

function NumberField({
  labelKey,
  unit,
  value,
  onChange,
  step = 'any',
}: {
  labelKey: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  step?: string;
}) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div className="field field--inline">
      <label htmlFor={id}>{t(labelKey)}</label>
      <span className="input-with-unit">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={`${id}-unit`}
        />
        <span id={`${id}-unit`} className="unit">
          {unit}
        </span>
      </span>
    </div>
  );
}

const WATER = [
  { value: 'distilled', labelKey: 'ui.choice.water.distilled' },
  { value: 'tap', labelKey: 'ui.choice.water.tap' },
] as const;
const GRIP = [
  { value: 'neck', labelKey: 'ui.choice.grip.neck' },
  { value: 'body', labelKey: 'ui.choice.grip.body' },
] as const;
const EYE = [
  { value: 'level', labelKey: 'ui.choice.eye.level' },
  { value: 'above', labelKey: 'ui.choice.eye.above' },
  { value: 'below', labelKey: 'ui.choice.eye.below' },
] as const;
const HANDLING = [
  { value: 'no_contact', labelKey: 'ui.choice.handling.no_contact' },
  { value: 'bare_hands', labelKey: 'ui.choice.handling.bare_hands' },
] as const;

type Water = (typeof WATER)[number]['value'];
type Grip = (typeof GRIP)[number]['value'];
type Eye = (typeof EYE)[number]['value'];
type Handling = (typeof HANDLING)[number]['value'];

function ActionForm({
  type,
  suggested,
  error,
  onSubmit,
  children,
  submitLabelKey,
}: {
  type: ActionType;
  suggested: boolean;
  error: FormErrorKey | null;
  onSubmit: () => void;
  children?: ReactNode;
  submitLabelKey?: string;
}) {
  const { t } = useTranslation();
  const busy = useSession((s) => s.ui.busy);
  const errorId = `action-error-${type}`;
  return (
    <form
      id={`action-form-${type}`}
      className={suggested ? 'action-form action-form--suggested' : 'action-form'}
      aria-labelledby={`action-title-${type}`}
      tabIndex={-1}
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <h4 id={`action-title-${type}`} className="action-form__title">
        {t(`exp04.action.${type}`)}
        {suggested && <span className="tag tag--suggested">{t('ui.action.suggested')}</span>}
      </h4>
      {children}
      {error && (
        <p id={errorId} className="form-error" role="alert">
          {t(error)}
        </p>
      )}
      <button
        type="submit"
        className="button button--action"
        disabled={busy}
        aria-describedby={error ? errorId : undefined}
      >
        {t(submitLabelKey ?? `exp04.action.${type}`)}
      </button>
    </form>
  );
}

const handlingRequired = (h: Handling | null) => (h === null ? 'ui.form.choose_option' : null);

export function ActionParameterForm({ type, suggested }: { type: ActionType; suggested: boolean }) {
  const { t } = useTranslation();
  const { error, submit } = useActionSubmit();
  const engine = useSession((s) => s.engine);
  const preLab = useSession((s) => s.preLab);
  const pendingApparatus = useSession((s) => s.ui.pendingApparatus);
  const [checked, setChecked] = useState<string[]>(
    type === 'confirm_safety' ? preLab.acknowledgedSafety : [],
  );
  const [num, setNum] = useState('');
  const [water, setWater] = useState<Water | null>(null);
  const [grip, setGrip] = useState<Grip | null>(null);
  const [eye, setEye] = useState<Eye | null>(null);
  const [handling, setHandling] = useState<Handling | null>(null);
  const [labelName, setLabelName] = useState('');
  const [labelDate, setLabelDate] = useState('');

  const toggle = (id: string) =>
    setChecked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const choose = <T,>(v: T | null) => (v === null ? 'ui.form.choose_option' : null);
  const numberProblem = () => (Number.isFinite(toNumber(num)) ? null : 'ui.form.invalid_number');
  const common = { type, suggested, error };

  switch (type) {
    case 'confirm_safety': {
      const items = engine.definition.safetyRules.filter((r) => r.kind === 'checklist');
      return (
        <ActionForm {...common} onSubmit={() => submit({ type, checklistItemIds: checked })}>
          <fieldset className="choice">
            <legend>{t('ui.form.safety_items')}</legend>
            {items.map((r) => (
              <div className="check" key={r.id}>
                <input
                  type="checkbox"
                  id={`cs-${r.id}`}
                  checked={checked.includes(r.id)}
                  onChange={() => toggle(r.id)}
                />
                <label htmlFor={`cs-${r.id}`}>{t(r.textKey)}</label>
              </div>
            ))}
          </fieldset>
        </ActionForm>
      );
    }
    case 'select_apparatus':
      return (
        <ActionForm
          {...common}
          onSubmit={() =>
            submit({ type, apparatusIds: pendingApparatus }, () =>
              pendingApparatus.length ? null : 'ui.form.choose_apparatus',
            )
          }
        >
          <p className="hint-text">{t('ui.form.select_apparatus_help')}</p>
          <p>
            {t('ui.form.chosen')}{' '}
            {pendingApparatus.length === 0
              ? t('ui.canvas.nothing')
              : pendingApparatus
                  .map((id) =>
                    t(engine.definition.apparatus.find((a) => a.id === id)?.nameKey ?? id),
                  )
                  .join(', ')}
          </p>
        </ActionForm>
      );
    case 'clean_glassware': {
      const glassware = engine.definition.apparatus.filter((a) => a.requiresCleaning);
      return (
        <ActionForm
          {...common}
          onSubmit={() =>
            submit({ type, apparatusIds: checked }, () =>
              checked.length ? null : 'ui.form.choose_apparatus',
            )
          }
        >
          <fieldset className="choice">
            <legend>{t('ui.form.glassware_to_clean')}</legend>
            {glassware.map((a) => (
              <div className="check" key={a.id}>
                <input
                  type="checkbox"
                  id={`cg-${a.id}`}
                  checked={checked.includes(a.id)}
                  onChange={() => toggle(a.id)}
                />
                <label htmlFor={`cg-${a.id}`}>{t(a.nameKey)}</label>
              </div>
            ))}
          </fieldset>
        </ActionForm>
      );
    }
    case 'set_balance_sliders':
      return (
        <ActionForm
          {...common}
          onSubmit={() =>
            submit({ type, mass: { value: toNumber(num), unit: 'g' } }, numberProblem)
          }
        >
          <NumberField
            labelKey="ui.form.slider_total"
            unit={UNIT_LABEL.g}
            value={num}
            onChange={setNum}
          />
        </ActionForm>
      );
    case 'add_solid':
    case 'remove_solid':
      return (
        <ActionForm
          {...common}
          onSubmit={() =>
            submit(
              {
                type,
                mass: { value: toNumber(num), unit: 'g' },
                handContact: handling === 'bare_hands',
              },
              () => numberProblem() ?? handlingRequired(handling),
            )
          }
        >
          <NumberField
            labelKey="ui.form.solid_mass"
            unit={UNIT_LABEL.g}
            value={num}
            onChange={setNum}
          />
          <Choice
            name={type}
            legendKey="ui.choice.handling.legend"
            options={HANDLING}
            value={handling}
            onChange={setHandling}
          />
        </ActionForm>
      );
    case 'transfer_solid':
      return (
        <ActionForm
          {...common}
          onSubmit={() =>
            submit(
              {
                type,
                fractionIntoFunnel: toNumber(num) / 100,
                handContact: handling === 'bare_hands',
              },
              () => numberProblem() ?? handlingRequired(handling),
            )
          }
        >
          <NumberField
            labelKey="ui.form.portion_into_funnel"
            unit="%"
            value={num}
            onChange={setNum}
          />
          <Choice
            name={type}
            legendKey="ui.choice.handling.legend"
            options={HANDLING}
            value={handling}
            onChange={setHandling}
          />
        </ActionForm>
      );
    case 'rinse_watch_glass':
    case 'rinse_funnel':
      return (
        <ActionForm
          {...common}
          onSubmit={() => submit({ type, source: water }, () => choose(water))}
        >
          <Choice
            name={type}
            legendKey="ui.choice.water.legend"
            options={WATER}
            value={water}
            onChange={setWater}
          />
        </ActionForm>
      );
    case 'add_water':
      return (
        <ActionForm
          {...common}
          onSubmit={() =>
            submit(
              { type, volume: { value: toNumber(num), unit: 'cm3' }, source: water },
              () => numberProblem() ?? choose(water),
            )
          }
        >
          <NumberField
            labelKey="ui.form.water_volume"
            unit={UNIT_LABEL.cm3}
            value={num}
            onChange={setNum}
          />
          <Choice
            name={type}
            legendKey="ui.choice.water.legend"
            options={WATER}
            value={water}
            onChange={setWater}
          />
        </ActionForm>
      );
    case 'stopper_flask':
      return <StopperForm suggested={suggested} />;
    case 'dissolve_solute':
      return (
        <ActionForm {...common} onSubmit={() => submit({ type, grip }, () => choose(grip))}>
          <p className="hint-text">{t('ui.form.dissolve_help')}</p>
          <Choice
            name={type}
            legendKey="ui.choice.grip.legend"
            options={GRIP}
            value={grip}
            onChange={setGrip}
          />
        </ActionForm>
      );
    case 'adjust_to_mark':
      return (
        <ActionForm
          {...common}
          onSubmit={() =>
            submit({ type, source: water, eyeLevel: eye }, () => choose(water) ?? choose(eye))
          }
        >
          <Choice
            name={type}
            legendKey="ui.choice.water.legend"
            options={WATER}
            value={water}
            onChange={setWater}
          />
          <Choice
            name={`${type}-eye`}
            legendKey="ui.choice.eye.legend"
            options={EYE}
            value={eye}
            onChange={setEye}
          />
        </ActionForm>
      );
    case 'mix_solution':
      return (
        <ActionForm
          {...common}
          onSubmit={() =>
            submit({ type, inversions: toNumber(num), grip }, () => numberProblem() ?? choose(grip))
          }
        >
          <NumberField
            labelKey="ui.form.inversions"
            unit={t('ui.form.times')}
            value={num}
            onChange={setNum}
            step="1"
          />
          <Choice
            name={type}
            legendKey="ui.choice.grip.legend"
            options={GRIP}
            value={grip}
            onChange={setGrip}
          />
        </ActionForm>
      );
    case 'apply_label':
      return (
        <ActionForm
          {...common}
          onSubmit={() => {
            const concentration =
              num.trim() === '' ? null : { value: toNumber(num), unit: 'mol dm-3' };
            submit(
              {
                type,
                solutionName: labelName,
                concentration,
                preparationDate: labelDate === '' ? null : labelDate,
              },
              () =>
                num.trim() !== '' && !Number.isFinite(toNumber(num))
                  ? 'ui.form.invalid_number'
                  : null,
            );
          }}
        >
          <p className="hint-text">{t('ui.form.label_help')}</p>
          <div className="field field--inline">
            <label htmlFor="label-name">{t('ui.form.label_name')}</label>
            <input
              id="label-name"
              type="text"
              value={labelName}
              onChange={(e) => setLabelName(e.target.value)}
            />
          </div>
          <NumberField
            labelKey="ui.form.label_concentration"
            unit={UNIT_LABEL['mol dm-3']}
            value={num}
            onChange={setNum}
          />
          <div className="field field--inline">
            <label htmlFor="label-date">{t('ui.form.label_date')}</label>
            <input
              id="label-date"
              type="date"
              value={labelDate}
              onChange={(e) => setLabelDate(e.target.value)}
            />
          </div>
        </ActionForm>
      );
    case 'weigh_watch_glass':
    case 'place_funnel':
    case 'remove_funnel':
    case 'request_hint':
    case 'submit_experiment':
    case 'restart_experiment':
      return <ActionForm {...common} onSubmit={() => submit({ type })} />;
  }
}

function StopperForm({ suggested }: { suggested: boolean }) {
  const { t } = useTranslation();
  const { error, submit, busy } = useActionSubmit();
  return (
    <div
      id="action-form-stopper_flask"
      className={suggested ? 'action-form action-form--suggested' : 'action-form'}
      role="group"
      aria-labelledby="action-title-stopper_flask"
    >
      <h4 id="action-title-stopper_flask" className="action-form__title">
        {t('exp04.action.stopper_flask')}
        {suggested && <span className="tag tag--suggested">{t('ui.action.suggested')}</span>}
      </h4>
      {error && (
        <p className="form-error" role="alert">
          {t(error)}
        </p>
      )}
      <div className="button-row">
        <button
          type="button"
          className="button button--action"
          disabled={busy}
          onClick={() => submit({ type: 'stopper_flask', inserted: true })}
        >
          {t('ui.form.insert_stopper')}
        </button>
        <button
          type="button"
          className="button button--action"
          disabled={busy}
          onClick={() => submit({ type: 'stopper_flask', inserted: false })}
        >
          {t('ui.form.remove_stopper')}
        </button>
      </div>
    </div>
  );
}
