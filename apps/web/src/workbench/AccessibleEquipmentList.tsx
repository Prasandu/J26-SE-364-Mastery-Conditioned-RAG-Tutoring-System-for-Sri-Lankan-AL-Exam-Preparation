import { useTranslation } from 'react-i18next';
import { useSession } from '../store/StoreProvider';
import { ApparatusThumb } from './lab2d/Lab2DDefs';
import { placementOf, REAGENT_ITEM_ID, type SceneItem, type SceneModel } from './sceneModel';

/**
 * Equipment tray: every apparatus item with the same picture the laboratory draws, its public
 * status, and a checkbox (keyboard / screen-reader path). Choosing an item here calls the same
 * `pickItem` handler as selecting it in the 2D or 3D laboratory.
 */
function StatusChips({ item, model }: { item: SceneItem; model: SceneModel }) {
  const { t } = useTranslation();
  const placement = placementOf(item, model);
  return (
    <span className="tray-item__chips">
      <span className={placement === 'shelf' ? 'mini-chip' : 'mini-chip mini-chip--bench'}>
        {t(`ui.lab.where.${placement}`)}
      </span>
      {item.cleanliness === 'dirty' && (
        <span className="mini-chip mini-chip--warn">{t('ui.equipment.chip_dirty')}</span>
      )}
      {item.cleanliness === 'clean' && (
        <span className="mini-chip mini-chip--ok">{t('ui.equipment.chip_clean')}</span>
      )}
    </span>
  );
}

export function AccessibleEquipmentList({ model }: { model: SceneModel }) {
  const { t } = useTranslation();
  const pickItem = useSession((s) => s.pickItem);
  const pending = useSession((s) => s.ui.pendingApparatus);
  const apparatus = model.items.filter((i) => i.kind !== 'reagent');
  const reagent = model.items.find((i) => i.id === REAGENT_ITEM_ID);

  return (
    <section className="panel equipment-tray" aria-labelledby="equipment-title">
      <h2 id="equipment-title">{t('ui.equipment.title')}</h2>
      <p className="hint-text">{t('ui.equipment.help')}</p>
      <ul className="equipment-tray__grid">
        {apparatus.map((item) => (
          <li
            key={item.id}
            className={item.highlighted ? 'tray-item tray-item--selected' : 'tray-item'}
          >
            <input
              type="checkbox"
              id={`equip-${item.id}`}
              checked={pending.includes(item.id)}
              onChange={() => pickItem(item.id)}
            />
            <label htmlFor={`equip-${item.id}`}>
              <span className="tray-item__thumb">
                <ApparatusThumb item={item} model={model} />
              </span>
              <span className="tray-item__name">{t(item.nameKey)}</span>
              <StatusChips item={item} model={model} />
              {item.highlighted && (
                <span className="visually-hidden">{t('ui.equipment.selected')}</span>
              )}
            </label>
          </li>
        ))}
      </ul>
      {reagent && (
        <>
          <h3 className="equipment-tray__subtitle">{t('ui.equipment.chemicals')}</h3>
          <button
            type="button"
            className={
              reagent.highlighted
                ? 'tray-item tray-item--button tray-item--selected'
                : 'tray-item tray-item--button'
            }
            aria-pressed={reagent.highlighted}
            onClick={() => pickItem(REAGENT_ITEM_ID)}
          >
            <span className="tray-item__thumb">
              <ApparatusThumb item={reagent} model={model} />
            </span>
            <span className="tray-item__name">{t(reagent.nameKey)}</span>
          </button>
        </>
      )}
    </section>
  );
}
