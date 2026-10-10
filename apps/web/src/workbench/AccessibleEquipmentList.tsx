import { useTranslation } from 'react-i18next';
import { useSession } from '../store/StoreProvider';
import { REAGENT_ITEM_ID, type SceneModel } from './sceneModel';

/**
 * Keyboard/screen-reader path for everything the 3D scene offers. Choosing an item here calls the
 * same `pickItem` handler as clicking it in the scene.
 */
const NO_CLEANLINESS: Record<string, 'dirty' | 'clean'> = {};

export function AccessibleEquipmentList({ model }: { model: SceneModel }) {
  const { t } = useTranslation();
  const pickItem = useSession((s) => s.pickItem);
  const pending = useSession((s) => s.ui.pendingApparatus);
  const cleanliness = useSession((s) => s.session?.bench.cleanliness ?? NO_CLEANLINESS);
  const apparatus = model.items.filter((i) => i.kind !== 'reagent');
  const reagent = model.items.find((i) => i.id === REAGENT_ITEM_ID);

  return (
    <section className="panel equipment-list" aria-labelledby="equipment-title">
      <h2 id="equipment-title">{t('ui.equipment.title')}</h2>
      <p className="hint-text">{t('ui.equipment.help')}</p>
      <ul>
        {apparatus.map((item) => {
          const status = [
            item.onBench ? t('ui.equipment.on_bench') : null,
            cleanliness[item.id] === 'clean'
              ? t('ui.equipment.cleaned')
              : cleanliness[item.id] === 'dirty'
                ? t('ui.equipment.not_cleaned')
                : null,
          ].filter(Boolean);
          return (
            <li
              key={item.id}
              className={
                item.highlighted ? 'equipment-item equipment-item--highlighted' : 'equipment-item'
              }
            >
              <input
                type="checkbox"
                id={`equip-${item.id}`}
                checked={pending.includes(item.id)}
                onChange={() => pickItem(item.id)}
              />
              <label htmlFor={`equip-${item.id}`}>
                {t(item.nameKey)}
                {status.length > 0 && (
                  <span className="equipment-item__status"> — {status.join(', ')}</span>
                )}
              </label>
            </li>
          );
        })}
      </ul>
      {reagent && (
        <button
          type="button"
          className="button"
          onClick={() => {
            pickItem(REAGENT_ITEM_ID);
            document.getElementById('action-form-add_solid')?.focus();
          }}
        >
          {t('ui.equipment.use_reagent', { name: t(reagent.nameKey) })}
        </button>
      )}
    </section>
  );
}
