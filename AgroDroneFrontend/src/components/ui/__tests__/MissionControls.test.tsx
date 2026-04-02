import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MissionControls } from '../MissionControls';

const onSaveFlightPlan = vi.fn();

describe('MissionControls — planning tab', () => {
  it('renders the Save Flight Plan button', () => {
    render(<MissionControls activeTab="planning" onSaveFlightPlan={onSaveFlightPlan} />);
    expect(screen.getByRole('button', { name: 'Save Flight Plan' })).toBeInTheDocument();
  });

  it('calls onSaveFlightPlan when Save Flight Plan is clicked', () => {
    render(<MissionControls activeTab="planning" onSaveFlightPlan={onSaveFlightPlan} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save Flight Plan' }));
    expect(onSaveFlightPlan).toHaveBeenCalledTimes(1);
  });

  it('does not render flight plan buttons', () => {
    render(<MissionControls activeTab="planning" onSaveFlightPlan={onSaveFlightPlan} />);
    expect(screen.queryByRole('button', { name: 'Get Flight Plans' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Set Active' })).not.toBeInTheDocument();
  });
});

describe('MissionControls — flights tab', () => {
  it('renders nothing', () => {
    const { container } = render(<MissionControls activeTab="flights" onSaveFlightPlan={onSaveFlightPlan} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('does not render Save Flight Plan button', () => {
    render(<MissionControls activeTab="flights" onSaveFlightPlan={onSaveFlightPlan} />);
    expect(screen.queryByRole('button', { name: 'Save Flight Plan' })).not.toBeInTheDocument();
  });
});

describe('MissionControls — sensor tab', () => {
  it('renders nothing', () => {
    const { container } = render(<MissionControls activeTab="sensor" onSaveFlightPlan={onSaveFlightPlan} />);
    expect(container).toBeEmptyDOMElement();
  });
});
