import { useState } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nextProvider } from 'react-i18next';
import { createI18n, resources } from '../i18n';
import { PracticeNotebook, PRACTICE_SECTIONS } from '../workbench/PracticeNotebook';
import { moveBenchAssembly } from '../workbench/benchLayout';

afterEach(cleanup);
describe('practice notebook and arrangement boundary', () => {
  it.each(['en', 'si'] as const)(
    'toggles sections and preserves learner text with keyboard navigation (%s)',
    async (lang) => {
      const i18n = createI18n();
      await i18n.changeLanguage(lang);
      const text = resources[lang].translation;
      function Notebook() {
        const [notes, setNotes] = useState('');
        const sections = Object.fromEntries(
          PRACTICE_SECTIONS.map((key) => [key, <p key={key}>{key}</p>]),
        );
        return (
          <PracticeNotebook>
            {
              {
                ...sections,
                predictions: (
                  <input
                    aria-label="Learner notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                ),
              } as Parameters<typeof PracticeNotebook>[0]['children']
            }
          </PracticeNotebook>
        );
      }
      render(
        <I18nextProvider i18n={i18n}>
          <Notebook />
        </I18nextProvider>,
      );
      const user = userEvent.setup();
      const rail = screen.getByRole('navigation', { name: text['ui.side.label']! });
      const buttons = within(rail).getAllByRole('button');
      await user.click(buttons[2]!);
      await user.type(screen.getByRole('textbox'), 'Exact learner notes');
      await user.click(buttons[2]!);
      expect(buttons[2]).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('textbox')).toBeNull();
      await user.keyboard('{ArrowDown}');
      expect(buttons[3]).toHaveFocus();
      await user.click(buttons[2]!);
      expect(screen.getByRole('textbox')).toHaveValue('Exact learner notes');
      await user.click(screen.getByRole('button', { name: text['ui.side.close_notebook']! }));
      expect(buttons[2]).toHaveFocus();
      expect(screen.queryByRole('textbox')).toBeNull();
    },
  );
  it('moves a connected rig within the worktop without changing relative positions or unrelated tools', () => {
    const nodes = [
      { id: 'tube', x: -3, z: 0 },
      { id: 'stand', x: -3.4, z: -0.3 },
      { id: 'collector', x: 2.2, z: 0 },
      { id: 'rod', x: 3.4, z: 0 },
    ];
    const offsets = moveBenchAssembly(nodes, {}, 'tube', { x: 30, z: 30 }, [
      'tube',
      'stand',
      'collector',
    ]);
    expect(offsets.tube).toEqual(offsets.stand);
    expect(offsets.tube).toEqual(offsets.collector);
    expect(offsets.rod).toBeUndefined();
    for (const node of nodes.filter((n) => n.id !== 'rod')) {
      expect(node.x + offsets[node.id]!.x).toBeLessThanOrEqual(4.45);
      expect(node.z + offsets[node.id]!.z).toBeLessThanOrEqual(1.1);
    }
    expect(nodes[0]!.x).toBe(-3);
  });
});
