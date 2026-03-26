import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MissionMetadataModal } from '../MissionMetadataModal';

// A vertex ~10 m from the base station (well within 30 m)
const BASE: [number, number] = [42.0, -71.0];
const NEAR_VERTEX = { lat: 42.00009, lng: -71.0 }; // ~10 m north
// A vertex ~500 m away
const FAR_VERTEX = { lat: 42.0045, lng: -71.0 };

function renderModal(overrides: Partial<Parameters<typeof MissionMetadataModal>[0]> = {}) {
  const defaults = {
    vertices: [NEAR_VERTEX],
    baseStationPos: BASE,
    onSave: vi.fn(),
    onCancel: vi.fn(),
  };
  return render(<MissionMetadataModal {...defaults} {...overrides} />);
}

describe('MissionMetadataModal — rendering', () => {
  it('renders the mission name input', () => {
    renderModal();
    expect(screen.getByPlaceholderText(/north field survey/i)).toBeInTheDocument();
  });

  it('renders the scheduled time input', () => {
    renderModal();
    expect(document.querySelector('input[type="datetime-local"]')).toBeInTheDocument();
  });

  it('renders the frequency select with four options', () => {
    renderModal();
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Once' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Daily' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Weekly' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Monthly' })).toBeInTheDocument();
  });

  it('renders Save Mission and Cancel buttons', () => {
    renderModal();
    expect(screen.getByRole('button', { name: 'Save Mission' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });
});

describe('MissionMetadataModal — submit disabled states', () => {
  it('disables submit when mission name is empty', () => {
    renderModal();
    // Fill time but leave name empty
    const timeInput = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    fireEvent.change(timeInput, { target: { value: '2026-06-01T09:00' } });
    expect(screen.getByRole('button', { name: 'Save Mission' })).toBeDisabled();
  });

  it('disables submit when scheduled time is not set', () => {
    renderModal();
    fireEvent.change(screen.getByPlaceholderText(/north field survey/i), {
      target: { value: 'Test Mission' },
    });
    expect(screen.getByRole('button', { name: 'Save Mission' })).toBeDisabled();
  });

  it('disables submit and shows error when baseStationPos is undefined', () => {
    renderModal({ baseStationPos: undefined });
    fireEvent.change(screen.getByPlaceholderText(/north field survey/i), {
      target: { value: 'Test Mission' },
    });
    const timeInput = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    fireEvent.change(timeInput, { target: { value: '2026-06-01T09:00' } });

    expect(screen.getByRole('button', { name: 'Save Mission' })).toBeDisabled();
    expect(screen.getByText(/base station position unavailable/i)).toBeInTheDocument();
  });

  it('disables submit and shows error when no vertex is within 30 m', () => {
    renderModal({ vertices: [FAR_VERTEX] });
    fireEvent.change(screen.getByPlaceholderText(/north field survey/i), {
      target: { value: 'Test Mission' },
    });
    const timeInput = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    fireEvent.change(timeInput, { target: { value: '2026-06-01T09:00' } });

    expect(screen.getByRole('button', { name: 'Save Mission' })).toBeDisabled();
    expect(screen.getByText(/no vertex is within 30 m/i)).toBeInTheDocument();
  });
});

describe('MissionMetadataModal — valid submission', () => {
  it('enables and calls onSave with correct shape when all fields are valid', () => {
    const onSave = vi.fn();
    renderModal({ onSave });

    fireEvent.change(screen.getByPlaceholderText(/north field survey/i), {
      target: { value: 'Spring Survey' },
    });
    const timeInput = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    fireEvent.change(timeInput, { target: { value: '2026-06-01T09:00' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'weekly' } });

    const btn = screen.getByRole('button', { name: 'Save Mission' });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);

    expect(onSave).toHaveBeenCalledTimes(1);
    const [meta] = onSave.mock.calls[0];
    expect(meta.missionName).toBe('Spring Survey');
    expect(meta.frequency).toBe('weekly');
    expect(typeof meta.scheduledAt).toBe('string');
  });

  it('trims whitespace from mission name before calling onSave', () => {
    const onSave = vi.fn();
    renderModal({ onSave });

    fireEvent.change(screen.getByPlaceholderText(/north field survey/i), {
      target: { value: '  Trimmed Name  ' },
    });
    const timeInput = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    fireEvent.change(timeInput, { target: { value: '2026-06-01T09:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Mission' }));

    expect(onSave.mock.calls[0][0].missionName).toBe('Trimmed Name');
  });
});

describe('MissionMetadataModal — cancel', () => {
  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn();
    renderModal({ onCancel });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
