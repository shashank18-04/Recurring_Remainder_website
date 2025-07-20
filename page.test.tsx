import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Page from './src/app/page'; // adjust the path if needed

describe('Recurring Date Picker Page Integration', () => {
  test('renders landing view correctly', () => {
    render(<Page />);

    expect(screen.getByText(/Remind Me/i)).toBeInTheDocument();
    expect(screen.getByText(/A Website That Never Forgets/i)).toBeInTheDocument();
    expect(screen.getByText(/Set Recurrence/i)).toBeInTheDocument();
  });
});
