import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SearchablePicker } from './SearchablePicker';

describe('SearchablePicker', () => {
  it('filters options and selects a recently used model', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    function ControlledPicker() {
      const [value, setValue] = useState('');
      return (
        <SearchablePicker
          label="Model"
          value={value}
          options={[
            { value: 'model-a', label: 'Model Alpha' },
            { value: 'model-b', label: 'Model Beta' },
          ]}
          recentValues={['model-b']}
          recentLabel="Recently used"
          allLabel="All models"
          placeholder="Model ID"
          searchPlaceholder="Search models"
          emptyMessage="No models found"
          onChange={(nextValue) => {
            onChange(nextValue);
            setValue(nextValue);
          }}
        />
      );
    }
    render(<ControlledPicker />);

    const trigger = screen.getByRole('button', { name: 'Model' });
    await user.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Model' })).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('group', { name: 'Recently used' })).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: 'Search models' }), 'beta');
    expect(screen.getByRole('option', { name: 'Model Beta' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Model Alpha' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'Model Beta' }));

    expect(onChange).toHaveBeenCalledWith('model-b');
    expect(trigger).toHaveTextContent('Model Beta');

    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Model' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('accepts a manually entered model ID with Enter', async () => {
    const onChange = vi.fn();
    render(
      <SearchablePicker
        label="Model"
        value=""
        options={[]}
        placeholder="Model ID"
        searchPlaceholder="Search models"
        emptyMessage="No models found"
        customValueLabel={(model) => `Use "${model}"`}
        allowCustomValue
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Model' }));
    const search = screen.getByRole('searchbox', { name: 'Search models' });
    fireEvent.change(search, { target: { value: ' custom-model ' } });
    expect(screen.getByRole('option', { name: 'Use "custom-model"' })).toBeInTheDocument();
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('custom-model');
  });

  it('filters large model lists by free tier and publisher', async () => {
    const user = userEvent.setup();
    render(
      <SearchablePicker
        label="Model"
        value=""
        options={[
          {
            value: 'meta-llama/llama-3.1-8b-instruct:free',
            label: 'meta-llama/llama-3.1-8b-instruct:free',
          },
          { value: 'meta-llama/llama-3.3-70b', label: 'meta-llama/llama-3.3-70b' },
          { value: 'anthropic/claude-3.7-sonnet', label: 'anthropic/claude-3.7-sonnet' },
        ]}
        placeholder="Model ID"
        searchPlaceholder="Search models"
        emptyMessage="No models found"
        allLabel="All models"
        allFilterLabel="All models"
        filters={[
          {
            value: 'free',
            label: 'Free',
            count: 1,
            matches: (option) => option.value.endsWith(':free'),
          },
          {
            value: 'publisher:meta-llama',
            label: 'meta-llama',
            count: 2,
            matches: (option) => option.value.startsWith('meta-llama/'),
          },
        ]}
        onChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Model' }));
    await user.click(screen.getByRole('button', { name: /Free/ }));
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option')).toHaveTextContent(':free');

    await user.click(screen.getByRole('button', { name: /meta-llama/ }));
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.queryByRole('option', { name: 'anthropic/claude-3.7-sonnet' })).toBeNull();
  });
});
