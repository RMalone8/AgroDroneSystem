import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MissionControls } from '../MissionControls';

const onSaveMission = vi.fn();

describe('MissionControls — planning tab', () => {
  it('renders the Save Mission button', () => {
    render(<MissionControls activeTab="planning" onSaveMission={onSaveMission} />);
    expect(screen.getByRole('button', { name: 'Save Mission' })).toBeInTheDocument();
  });

  it('calls onSaveMission when Save Mission is clicked', () => {
    render(<MissionControls activeTab="planning" onSaveMission={onSaveMission} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save Mission' }));
    expect(onSaveMission).toHaveBeenCalledTimes(1);
  });

  it('does not render flight plan buttons', () => {
    render(<MissionControls activeTab="planning" onSaveMission={onSaveMission} />);
    expect(screen.queryByRole('button', { name: 'Get Flight Plans' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Set Active' })).not.toBeInTheDocument();
  });
});

describe('MissionControls — flights tab', () => {
  it('renders nothing', () => {
    const { container } = render(<MissionControls activeTab="flights" onSaveMission={onSaveMission} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('does not render Save Mission button', () => {
    render(<MissionControls activeTab="flights" onSaveMission={onSaveMission} />);
    expect(screen.queryByRole('button', { name: 'Save Mission' })).not.toBeInTheDocument();
  });
});

describe('MissionControls — sensor tab', () => {
  it('renders nothing', () => {
    const { container } = render(<MissionControls activeTab="sensor" onSaveMission={onSaveMission} />);
    expect(container).toBeEmptyDOMElement();
  });
});
