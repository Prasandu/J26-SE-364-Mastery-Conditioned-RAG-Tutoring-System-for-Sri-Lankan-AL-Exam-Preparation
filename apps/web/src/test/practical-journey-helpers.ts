import { fireEvent, screen, within } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
import { resources } from '../i18n';

const tx = (key: string) => resources.en.translation[`ui.journey.${key}`]!;
export const stageButton = (stage: string) =>
  within(
    screen.getByRole('navigation', {
      name: tx('navigation'),
    }),
  ).getByRole('button', { name: new RegExp(`${tx(stage)}$`) });

export async function preparePractical(user: ReturnType<typeof userEvent.setup>) {
  await user.click(stageButton('prelab'));
  for (const field of screen.getAllByRole('textbox'))
    fireEvent.change(field, { target: { value: 'My reasoned prediction and preparation.' } });
  await user.click(stageButton('setup'));
  for (const checkbox of screen.getAllByRole('checkbox')) await user.click(checkbox);
  await user.click(screen.getByRole('button', { name: tx('start') }));
}

export async function reflectAndReport(user: ReturnType<typeof userEvent.setup>) {
  await user.click(stageButton('reflection'));
  for (const field of screen.getAllByRole('textbox'))
    fireEvent.change(field, { target: { value: 'My reflection on the recorded evidence.' } });
  await user.click(stageButton('report'));
}
