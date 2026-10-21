import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ApparatusKindSchema,
  TeachingColourSchema,
  TeachingDefinitionSchema,
  teachingIssues,
  type LocalText,
  type TeachingDefinition,
  type TeachingRecord,
} from '@vlab/contracts';
import { teachingPractice } from '../engine/localAdapter';
import { useSession } from '../store/StoreProvider';
import { TeachingSandbox } from '../views/TeachingWorkspace';
import type { AdminClient } from './adminClient';

type Panel = 'guide' | 'apparatus' | 'procedure' | 'outcomes' | 'review';
const empty = (): LocalText => ({ en: '', si: '' });
const identifier = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
function copyTemplate(d: TeachingDefinition, number: number): TeachingDefinition {
  return {
    ...structuredClone(d),
    id: `local-practical-${number}`,
    revision: 1,
    experimentNumber: number,
    title: {
      en: d.title.en.replace(/^Experiment \d+:/, `Experiment ${number}:`),
      si: d.title.si.replace(/^පරීක්ෂණය \d+:/, `පරීක්ෂණය ${number}:`),
    },
  };
}
function completeMatrix(d: TeachingDefinition) {
  if (d.template === 'fixed_volume_kinetics') {
    d.outcomes = [];
    return;
  }
  const before = d.outcomes;
  d.outcomes = d.samples.flatMap((s) =>
    d.tests.map(
      (t) =>
        before.find((o) => o.sampleId === s.id && o.testId === t.id) ?? {
          sampleId: s.id,
          testId: t.id,
          observation: empty(),
          solutionColour: 'clear',
          precipitateColour: null,
          visual: 'none',
          sourceIndexes: [0],
        },
    ),
  );
}
function Pair({
  label,
  value,
  onChange,
}: {
  label: string;
  value: LocalText;
  onChange: (text: LocalText) => void;
}) {
  const { t } = useTranslation();
  return (
    <fieldset className="simulation-author__pair">
      <legend>{label}</legend>
      {(['en', 'si'] as const).map((l) => (
        <label key={l}>
          <span>{t(`teaching.author.${l}`)}</span>
          <textarea
            rows={2}
            lang={l}
            value={value[l]}
            onChange={(e) => onChange({ ...value, [l]: e.target.value })}
          />
        </label>
      ))}
    </fieldset>
  );
}
function TextList({
  label,
  items,
  onChange,
}: {
  label: string;
  items: LocalText[];
  onChange: (items: LocalText[]) => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="simulation-author__list">
      <h3>{label}</h3>
      {items.map((value, i) => (
        <div key={i}>
          <Pair
            label={`${label} ${i + 1}`}
            value={value}
            onChange={(v) => onChange(items.map((x, n) => (n === i ? v : x)))}
          />
          <button
            className="button"
            type="button"
            disabled={items.length <= 1}
            onClick={() => onChange(items.filter((_, n) => n !== i))}
          >
            {t('teaching.author.remove')} {i + 1}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="button"
        disabled={items.length >= 12}
        onClick={() => onChange([...items, empty()])}
      >
        {t('teaching.author.add')}
      </button>
    </section>
  );
}
function Preview({ definition, onClose }: { definition: TeachingDefinition; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog ref={dialog} className="simulation-author__preview" onCancel={onClose}>
      <TeachingSandbox
        definition={definition}
        onBack={() => {
          dialog.current?.close();
          onClose();
        }}
      />
    </dialog>
  );
}

export function SimulationAuthor({ client }: { client: AdminClient }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'si' ? 'si' : 'en';
  const [draft, setDraft] = useState(() => copyTemplate(teachingPractice.bundled[0]!, 31));
  const [baseline, setBaseline] = useState(() => JSON.stringify(draft));
  const [records, setRecords] = useState<TeachingRecord[]>([]),
    [record, setRecord] = useState<TeachingRecord | null>(null);
  const [example, setExample] = useState(teachingPractice.bundled[0]!.id),
    [panel, setPanel] = useState<Panel>('guide');
  const [preview, setPreview] = useState<TeachingDefinition | null>(null),
    [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null),
    [reviewer, setReviewer] = useState(''),
    [attest, setAttest] = useState(false);
  const setAuthored = useSession((s) => s.setAuthoredTeaching);
  const dirty = JSON.stringify(draft) !== baseline;
  const parsed = TeachingDefinitionSchema.safeParse(draft);
  const structural = parsed.success
    ? teachingIssues(parsed.data)
    : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.code}`);
  const issues = [
    ...structural,
    ...(draft.experimentNumber <= 30 || draft.id.startsWith('handbook-')
      ? ['reserved_practical']
      : []),
  ];
  const valid = parsed.success && issues.length === 0;
  const refresh = async () => {
    const list = await client.simulationModels!();
    setRecords(list);
    setAuthored(
      list.filter((r) => r.status === 'local_active' && r.review).map((r) => r.definition),
    );
    return list;
  };
  useEffect(() => {
    let active = true;
    if (client.simulationModels)
      client.simulationModels().then(
        (items) => {
          if (active) setRecords(items);
        },
        () => {
          if (active) setNotice('teaching.author.save_failed');
        },
      );
    return () => {
      active = false;
    };
  }, [client]);
  const change = (mutate: (d: TeachingDefinition) => void) => {
    setDraft((current) => {
      const next = structuredClone(current);
      if (record && next.revision <= record.definition.revision)
        next.revision = record.definition.revision + 1;
      mutate(next);
      return next;
    });
    setAttest(false);
    setNotice(null);
  };
  const load = (r: TeachingRecord | null, d: TeachingDefinition) => {
    setRecord(r);
    setDraft(structuredClone(d));
    setBaseline(JSON.stringify(d));
    setAttest(false);
    setNotice(null);
  };
  const save = async () => {
    if (!valid || !client.saveSimulationModel) return;
    setBusy(true);
    setNotice(null);
    try {
      const saved = await client.saveSimulationModel(
        record?.id ?? null,
        record?.version ?? null,
        parsed.data,
      );
      load(saved, saved.definition);
      await refresh();
      setNotice('teaching.author.saved_notice');
    } catch {
      setNotice('teaching.author.save_failed');
    } finally {
      setBusy(false);
    }
  };
  const activate = async () => {
    if (!record || dirty || !attest || !reviewer.trim() || !client.activateLocalSimulation) return;
    setBusy(true);
    try {
      const active = await client.activateLocalSimulation(
        record.id,
        record.version,
        reviewer.trim(),
      );
      load(active, active.definition);
      await refresh();
    } catch {
      setNotice('teaching.author.save_failed');
    } finally {
      setBusy(false);
    }
  };
  if (!client.simulationModels || !client.saveSimulationModel || !client.activateLocalSimulation)
    return <p>{t('teaching.author.unavailable')}</p>;
  return (
    <section className="simulation-author" aria-labelledby="simulation-author-title">
      <h2 id="simulation-author-title">{t('teaching.author.title')}</h2>
      <p>{t('teaching.author.notice')}</p>
      <div className="card simulation-author__catalog">
        <label>
          <span>{t('teaching.author.new')}</span>
          <select value={example} onChange={(e) => setExample(e.target.value)}>
            {teachingPractice.bundled.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title[locale]}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button"
          type="button"
          disabled={busy}
          onClick={() => {
            const next = Math.max(30, ...records.map((r) => r.definition.experimentNumber)) + 1;
            load(
              null,
              copyTemplate(
                teachingPractice.bundled.find((d) => d.id === example)!,
                next,
              ),
            );
          }}
        >
          {t('teaching.author.clone')}
        </button>
        <label>
          <span>{t('teaching.author.saved')}</span>
          <select
            aria-label={t('teaching.author.saved')}
            value={record?.id ?? ''}
            onChange={(e) => {
              const r = records.find((x) => x.id === e.target.value);
              if (r) load(r, r.definition);
            }}
          >
            <option value="">—</option>
            {records.map((r) => (
              <option key={r.id} value={r.id}>
                {r.definition.experimentNumber} · {r.definition.title[locale]} ·{' '}
                {r.status === 'local_active'
                  ? t('teaching.author.active')
                  : t('teaching.author.staged')}
              </option>
            ))}
          </select>
        </label>
      </div>
      <nav className="handbook-lab__tabs" aria-label={t('teaching.author.title')}>
        {(['guide', 'apparatus', 'procedure', 'outcomes', 'review'] as Panel[]).map((p) => (
          <button
            key={p}
            className={panel === p ? 'button button--primary' : 'button'}
            type="button"
            aria-current={panel === p ? 'page' : undefined}
            onClick={() => setPanel(p)}
          >
            {t(`teaching.author.${p}`)}
          </button>
        ))}
      </nav>
      <div className="card simulation-author__editor">
        {panel === 'guide' && (
          <>
            <div className="simulation-author__columns">
              <label>
                {t('teaching.author.id')}
                <input
                  value={draft.id}
                  disabled={record !== null}
                  onChange={(e) =>
                    change((d) => {
                      d.id = e.target.value;
                    })
                  }
                />
              </label>
              <label>
                {t('teaching.author.number')}
                <input
                  type="number"
                  min="31"
                  max="99"
                  disabled={record !== null}
                  value={draft.experimentNumber || ''}
                  onChange={(e) =>
                    change((d) => {
                      d.experimentNumber = Number(e.target.value);
                    })
                  }
                />
              </label>
              <label>
                {t('teaching.author.unit')}
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={draft.unitNumber || ''}
                  onChange={(e) =>
                    change((d) => {
                      d.unitNumber = Number(e.target.value);
                    })
                  }
                />
              </label>
            </div>
            <Pair
              label={t('teaching.author.title_field')}
              value={draft.title}
              onChange={(v) =>
                change((d) => {
                  d.title = v;
                })
              }
            />
            <Pair
              label={t('teaching.author.unit_title')}
              value={draft.unitTitle}
              onChange={(v) =>
                change((d) => {
                  d.unitTitle = v;
                })
              }
            />
            <Pair
              label={t('teaching.author.background')}
              value={draft.background}
              onChange={(v) =>
                change((d) => {
                  d.background = v;
                })
              }
            />
            <Pair
              label={t('teaching.author.limits')}
              value={draft.limitations}
              onChange={(v) =>
                change((d) => {
                  d.limitations = v;
                })
              }
            />
            {(['aims', 'safety', 'chemicals', 'preLab', 'postLab'] as const).map((key) => (
              <TextList
                key={key}
                label={t(
                  `teaching.${({ aims: 'aims', safety: 'safety', chemicals: 'chemicals', preLab: 'pre_lab', postLab: 'post_lab' } as const)[key]}`,
                )}
                items={draft[key]}
                onChange={(items) =>
                  change((d) => {
                    d[key] = items;
                  })
                }
              />
            ))}
          </>
        )}
        {panel === 'apparatus' && (
          <>
            <label>
              {t('teaching.author.layout')}
              <select
                value={draft.layout}
                onChange={(e) =>
                  change((d) => {
                    d.layout = e.target.value as TeachingDefinition['layout'];
                  })
                }
              >
                {(['test_tubes', 'gas_collection', 'ice_bath', 'inverted_tube'] as const).map(
                  (id) => (
                    <option key={id} value={id}>
                      {t(`teaching.layout.${id}`)}
                    </option>
                  ),
                )}
              </select>
            </label>
            {draft.apparatus.map((a, i) => (
              <section key={a.id} className="simulation-author__item">
                <label>
                  {t('teaching.author.kind')} {i + 1}
                  <select
                    value={a.kind}
                    onChange={(e) =>
                      change((d) => {
                        const kind = e.target.value as typeof a.kind;
                        d.apparatus[i]!.kind = kind;
                        d.apparatus[i]!.label = {
                          en: t(`teaching.instrument.${kind}`, { lng: 'en' }),
                          si: t(`teaching.instrument.${kind}`, { lng: 'si' }),
                        };
                      })
                    }
                  >
                    {ApparatusKindSchema.options.map((kind) => (
                      <option key={kind} value={kind}>
                        {t(`teaching.instrument.${kind}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <Pair
                  label={t('teaching.author.label')}
                  value={a.label}
                  onChange={(v) =>
                    change((d) => {
                      d.apparatus[i]!.label = v;
                    })
                  }
                />
                <label>
                  {t('teaching.author.capacity')}
                  <input
                    type="number"
                    step="any"
                    value={a.capacityCm3 ?? ''}
                    onChange={(e) =>
                      change((d) => {
                        d.apparatus[i]!.capacityCm3 =
                          e.target.value === '' ? null : Number(e.target.value);
                      })
                    }
                  />
                </label>
                <button
                  className="button"
                  type="button"
                  disabled={draft.apparatus.length <= 1}
                  onClick={() =>
                    change((d) => {
                      d.apparatus.splice(i, 1);
                    })
                  }
                >
                  {t('teaching.author.remove')}
                </button>
              </section>
            ))}
            <button
              className="button"
              type="button"
              disabled={draft.apparatus.length >= 12}
              onClick={() =>
                change((d) => {
                  d.apparatus.push({
                    id: identifier('instrument'),
                    kind: 'test_tube',
                    label: {
                      en: t('teaching.instrument.test_tube', { lng: 'en' }),
                      si: t('teaching.instrument.test_tube', { lng: 'si' }),
                    },
                    capacityCm3: null,
                  });
                })
              }
            >
              {t('teaching.author.add')}
            </button>
            <h3>{t('teaching.author.samples')}</h3>
            {draft.samples.map((s, i) => (
              <section key={s.id} className="simulation-author__item">
                <Pair
                  label={`${t('teaching.sample')} ${i + 1}`}
                  value={s.label}
                  onChange={(v) =>
                    change((d) => {
                      d.samples[i]!.label = v;
                    })
                  }
                />
                <label>
                  {t('teaching.author.initial_colour')}
                  <select
                    value={s.colour}
                    onChange={(e) =>
                      change((d) => {
                        d.samples[i]!.colour = e.target.value as typeof s.colour;
                      })
                    }
                  >
                    {TeachingColourSchema.options.map((c) => (
                      <option key={c} value={c}>
                        {t(`teaching.colour.${c}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="button"
                  type="button"
                  disabled={draft.samples.length <= 1}
                  onClick={() =>
                    change((d) => {
                      d.samples.splice(i, 1);
                      completeMatrix(d);
                    })
                  }
                >
                  {t('teaching.author.remove')}
                </button>
              </section>
            ))}
            <button
              className="button"
              type="button"
              disabled={draft.template === 'fixed_volume_kinetics' || draft.samples.length >= 12}
              onClick={() =>
                change((d) => {
                  d.samples.push({ id: identifier('sample'), label: empty(), colour: 'clear' });
                  completeMatrix(d);
                })
              }
            >
              {t('teaching.author.add_sample')}
            </button>
          </>
        )}
        {panel === 'procedure' && (
          <>
            {draft.template === 'fixed_volume_kinetics' && (
              <label>
                {t('teaching.author.concentrations')}
                <input
                  key={record?.id ?? example}
                  defaultValue={draft.concentrationsMolDm3.join(', ')}
                  onBlur={(e) =>
                    change((d) => {
                      d.concentrationsMolDm3 = e.target.value
                        .split(',')
                        .map((v) => Number(v.trim()));
                    })
                  }
                />
              </label>
            )}
            {draft.tests.map((test, i) => (
              <section key={test.id} className="simulation-author__item">
                <Pair
                  label={`${t('teaching.test')} ${i + 1}`}
                  value={test.label}
                  onChange={(v) =>
                    change((d) => {
                      d.tests[i]!.label = v;
                    })
                  }
                />
                <fieldset>
                  <legend>{t('teaching.author.temperature')}</legend>
                  <div className="simulation-author__columns">
                    {([0, 1] as const).map((n) => (
                      <label key={n}>
                        {t(n === 0 ? 'teaching.author.minimum' : 'teaching.author.maximum')}
                        <input
                          type="number"
                          step="any"
                          value={test.temperatureRangeC?.[n] ?? ''}
                          onChange={(e) =>
                            change((d) => {
                              if (e.target.value === '') d.tests[i]!.temperatureRangeC = null;
                              else {
                                const range = d.tests[i]!.temperatureRangeC ?? [0, 5];
                                range[n] = Number(e.target.value);
                                d.tests[i]!.temperatureRangeC = range;
                              }
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                </fieldset>
                {test.steps.map((step, j) => (
                  <section key={step.id} className="simulation-author__step">
                    <Pair
                      label={`${t('teaching.author.step')} ${j + 1}`}
                      value={step.title}
                      onChange={(v) =>
                        change((d) => {
                          d.tests[i]!.steps[j]!.title = v;
                        })
                      }
                    />
                    <Pair
                      label={t('teaching.author.instruction')}
                      value={step.instruction}
                      onChange={(v) =>
                        change((d) => {
                          d.tests[i]!.steps[j]!.instruction = v;
                        })
                      }
                    />
                    <div className="simulation-author__columns">
                      <label>
                        {t('teaching.author.target')}
                        <select
                          value={step.apparatusId}
                          onChange={(e) =>
                            change((d) => {
                              d.tests[i]!.steps[j]!.apparatusId = e.target.value;
                            })
                          }
                        >
                          <option value="">—</option>
                          {draft.apparatus.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.label[locale]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {t('teaching.author.effect')}
                        <select
                          value={step.effect}
                          onChange={(e) =>
                            change((d) => {
                              d.tests[i]!.steps[j]!.effect = e.target.value as typeof step.effect;
                            })
                          }
                        >
                          {(
                            ['prepare', 'add', 'mix', 'heat', 'cool', 'observe', 'measure'] as const
                          ).map((a) => (
                            <option key={a} value={a}>
                              {t(`teaching.effect.${a}`)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <button
                      className="button"
                      type="button"
                      disabled={test.steps.length <= 2}
                      onClick={() =>
                        change((d) => {
                          d.tests[i]!.steps.splice(j, 1);
                        })
                      }
                    >
                      {t('teaching.author.remove')}
                    </button>
                  </section>
                ))}
                <button
                  className="button"
                  type="button"
                  disabled={test.steps.length >= 16}
                  onClick={() =>
                    change((d) => {
                      d.tests[i]!.steps.push({
                        id: identifier('step'),
                        title: empty(),
                        instruction: empty(),
                        apparatusId: d.apparatus[0]!.id,
                        effect: 'observe',
                      });
                    })
                  }
                >
                  {t('teaching.author.add')}
                </button>
                <button
                  className="button"
                  type="button"
                  disabled={draft.tests.length <= 1}
                  onClick={() =>
                    change((d) => {
                      d.tests.splice(i, 1);
                      completeMatrix(d);
                    })
                  }
                >
                  {t('teaching.author.remove')} {t('teaching.test')}
                </button>
              </section>
            ))}
            <button
              className="button"
              type="button"
              disabled={draft.template === 'fixed_volume_kinetics' || draft.tests.length >= 12}
              onClick={() =>
                change((d) => {
                  d.tests.push({
                    ...structuredClone(d.tests[0]!),
                    id: identifier('test'),
                    label: empty(),
                  });
                  completeMatrix(d);
                })
              }
            >
              {t('teaching.author.add_test')}
            </button>
          </>
        )}
        {panel === 'outcomes' && (
          <>
            <h3>{t('teaching.sources')}</h3>
            {draft.sources.map((source, i) => (
              <section key={i} className="simulation-author__item">
                <h4>{i + 1}</h4>
                <label>
                  {t('teaching.author.source_title')}
                  <input
                    value={source.title}
                    onChange={(e) =>
                      change((d) => {
                        d.sources[i]!.title = e.target.value;
                      })
                    }
                  />
                </label>
                <label>
                  {t('teaching.author.pages')}
                  <input
                    key={`${record?.id}-${i}`}
                    defaultValue={source.pdfPages.join(', ')}
                    onBlur={(e) =>
                      change((d) => {
                        d.sources[i]!.pdfPages = e.target.value.trim()
                          ? e.target.value.split(',').map((x) => Number(x.trim()))
                          : [];
                      })
                    }
                  />
                </label>
                <label>
                  {t('teaching.author.url')}
                  <input
                    value={source.url ?? ''}
                    onChange={(e) =>
                      change((d) => {
                        d.sources[i]!.url = e.target.value || null;
                      })
                    }
                  />
                </label>
                <label>
                  {t('teaching.author.checksum')}
                  <input
                    value={source.sha256 ?? ''}
                    onChange={(e) =>
                      change((d) => {
                        d.sources[i]!.sha256 = e.target.value || null;
                      })
                    }
                  />
                </label>
              </section>
            ))}
            <button
              type="button"
              className="button"
              disabled={draft.sources.length >= 12}
              onClick={() =>
                change((d) => {
                  d.sources.push({ title: '', pdfPages: [], sha256: null, url: null });
                })
              }
            >
              {t('teaching.author.add')}
            </button>
            {draft.outcomes.map((o, i) => (
              <section key={`${o.sampleId}-${o.testId}`} className="simulation-author__item">
                <h3>
                  {draft.samples.find((s) => s.id === o.sampleId)?.label[locale]} ·{' '}
                  {draft.tests.find((s) => s.id === o.testId)?.label[locale]}
                </h3>
                <Pair
                  label={t('teaching.author.observation')}
                  value={o.observation}
                  onChange={(v) =>
                    change((d) => {
                      d.outcomes[i]!.observation = v;
                    })
                  }
                />
                <div className="simulation-author__columns">
                  {(['solutionColour', 'precipitateColour'] as const).map((key) => (
                    <label key={key}>
                      {t(
                        key === 'solutionColour'
                          ? 'teaching.author.solution_colour'
                          : 'teaching.author.precipitate_colour',
                      )}
                      <select
                        value={o[key] ?? ''}
                        onChange={(e) =>
                          change((d) => {
                            if (key === 'precipitateColour')
                              d.outcomes[i]![key] = e.target.value
                                ? (e.target.value as typeof o.solutionColour)
                                : null;
                            else d.outcomes[i]![key] = e.target.value as typeof o.solutionColour;
                          })
                        }
                      >
                        {key === 'precipitateColour' && (
                          <option value="">{t('teaching.author.none')}</option>
                        )}
                        {TeachingColourSchema.options.map((c) => (
                          <option key={c} value={c}>
                            {t(`teaching.colour.${c}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <label>
                  {t('teaching.author.visual')}
                  <select
                    value={o.visual}
                    onChange={(e) =>
                      change((d) => {
                        d.outcomes[i]!.visual = e.target.value as typeof o.visual;
                      })
                    }
                  >
                    {(['none', 'bubbles', 'precipitate', 'silver_mirror', 'layers'] as const).map(
                      (v) => (
                        <option key={v} value={v}>
                          {t(`teaching.visual.${v}`)}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  {t('teaching.author.source_refs')}
                  <input
                    defaultValue={o.sourceIndexes.map((n) => n + 1).join(', ')}
                    onBlur={(e) =>
                      change((d) => {
                        d.outcomes[i]!.sourceIndexes = e.target.value.trim()
                          ? e.target.value.split(',').map((v) => Number(v.trim()) - 1)
                          : [];
                      })
                    }
                  />
                </label>
              </section>
            ))}
          </>
        )}
        {panel === 'review' && (
          <>
            <p role="status">{t(valid ? 'teaching.author.valid' : 'teaching.author.invalid')}</p>
            {issues.length > 0 && (
              <ul>
                {issues.slice(0, 30).map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            )}
            <label>
              {t('teaching.author.revision')}
              <input
                type="number"
                min="1"
                value={draft.revision || ''}
                onChange={(e) =>
                  change((d) => {
                    d.revision = Number(e.target.value);
                  })
                }
              />
            </label>
            {record && (
              <>
                <p>
                  {t('teaching.author.record', {
                    version: record.version,
                    revision: record.definition.revision,
                  })}
                </p>
                <p>
                  {t(
                    record.status === 'local_active'
                      ? 'teaching.author.active'
                      : 'teaching.author.staged',
                  )}
                </p>
              </>
            )}
            <p>{t('teaching.author.activate_notice')}</p>
            <label>
              {t('teaching.author.reviewer')}
              <input
                value={reviewer}
                maxLength={120}
                onChange={(e) => setReviewer(e.target.value)}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={attest}
                onChange={(e) => setAttest(e.target.checked)}
              />
              {t('teaching.author.attest')}
            </label>
            <button
              type="button"
              className="button button--primary"
              disabled={
                busy ||
                !record ||
                dirty ||
                !valid ||
                !attest ||
                !reviewer.trim() ||
                record.status === 'local_active'
              }
              onClick={() => void activate()}
            >
              {t('teaching.author.activate')}
            </button>
          </>
        )}
      </div>
      <div className="simulation-author__actions">
        <button
          type="button"
          className="button button--primary"
          disabled={busy || !valid || (record !== null && !dirty)}
          onClick={() => void save()}
        >
          {t('teaching.author.save')}
        </button>
        <button
          type="button"
          className="button"
          disabled={busy || !dirty}
          onClick={() => load(record, JSON.parse(baseline) as TeachingDefinition)}
        >
          {t('teaching.author.discard')}
        </button>
        <button
          type="button"
          className="button"
          disabled={!valid}
          onClick={() => setPreview(teachingPractice.parse(draft))}
        >
          {t('teaching.author.preview')}
        </button>
        <span role="status">{notice ? t(notice) : dirty ? t('teaching.author.unsaved') : ''}</span>
      </div>
      <details>
        <summary>
          {t('teaching.author.import')} / {t('teaching.author.download')}
        </summary>
        <label>
          {t('teaching.author.import')}
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file || file.size > 1e6) {
                setNotice('teaching.author.invalid');
                return;
              }
              file.text().then(
                (text) => {
                  try {
                    const d = teachingPractice.parse(JSON.parse(text));
                    load(null, d);
                  } catch {
                    setNotice('teaching.author.invalid');
                  }
                },
                () => setNotice('teaching.author.invalid'),
              );
              e.target.value = '';
            }}
          />
        </label>
        <button
          type="button"
          className="button"
          disabled={!valid}
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' }),
            );
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `${draft.id}.v${draft.revision}.json`;
            anchor.click();
            URL.revokeObjectURL(url);
          }}
        >
          {t('teaching.author.download')}
        </button>
      </details>
      {preview && <Preview definition={preview} onClose={() => setPreview(null)} />}
    </section>
  );
}
