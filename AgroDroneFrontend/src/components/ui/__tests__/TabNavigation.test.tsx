import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { TabNavigation } from '../TabNavigation';
import { TabType } from '../../../constants/types';

describe('TabNavigation', () => {
  const onTabChange = vi.fn();

  it('renders all three tab buttons', () => {
    render(<TabNavigation activeTab="planning" onTabChange={onTabChange} />);
    expect(screen.getByRole('button', { name: 'Flight Planning' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Flight Plan History' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sensor Data' })).toBeInTheDocument();
  });

  it.each<TabType>(['planning', 'flights', 'sensor'])(
    'highlights the "%s" tab as active',
    (tab) => {
      render(<TabNavigation activeTab={tab} onTabChange={onTabChange} />);
      const buttons = screen.getAllByRole('button');
      const active = buttons.find((b) => b.classList.contains('border-blue-500'));
      expect(active).toBeTruthy();
      expect(active).toHaveClass('text-blue-600');
    }
  );

  it('calls onTabChange with "flights" when Flight Plan History is clicked', async () => {
    const user = userEvent.setup();
    render(<TabNavigation activeTab="planning" onTabChange={onTabChange} />);
    await user.click(screen.getByRole('button', { name: 'Flight Plan History' }));
    expect(onTabChange).toHaveBeenCalledWith('flights');
  });

  it('calls onTabChange with "sensor" when Sensor Data is clicked', async () => {
    const user = userEvent.setup();
    render(<TabNavigation activeTab="planning" onTabChange={onTabChange} />);
    await user.click(screen.getByRole('button', { name: 'Sensor Data' }));
    expect(onTabChange).toHaveBeenCalledWith('sensor');
  });

  it('calls onTabChange with "planning" when Flight Planning is clicked', async () => {
    const user = userEvent.setup();
    render(<TabNavigation activeTab="flights" onTabChange={onTabChange} />);
    await user.click(screen.getByRole('button', { name: 'Flight Planning' }));
    expect(onTabChange).toHaveBeenCalledWith('planning');
  });
});
