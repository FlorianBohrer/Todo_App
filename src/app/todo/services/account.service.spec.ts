import { HttpErrorResponse } from '@angular/common/http';

import { deleteAccountErrorMessage, isDeleteConfirmed } from './account.service';

describe('isDeleteConfirmed', () => {
  it('needs the whole word', () => {
    expect(isDeleteConfirmed('')).toBe(false);
    expect(isDeleteConfirmed('DELET')).toBe(false);
    expect(isDeleteConfirmed('DELETE')).toBe(true);
  });

  it('does not insist on capitals or exact spacing', () => {
    expect(isDeleteConfirmed('delete')).toBe(true);
    expect(isDeleteConfirmed(' Delete ')).toBe(true);
  });

  it('does not accept the word inside something else', () => {
    expect(isDeleteConfirmed('DELETE ME')).toBe(false);
    expect(isDeleteConfirmed('UNDELETE')).toBe(false);
  });
});

describe('deleteAccountErrorMessage', () => {
  const failure = (status: number) =>
    new HttpErrorResponse({ status, error: { message: 'raw server text', stack: 'at x' } });

  it('says that nothing was deleted when the server never answered', () => {
    expect(deleteAccountErrorMessage(failure(0))).toContain('Nothing was deleted');
  });

  it('says that nothing was deleted when the server does not know the route yet', () => {
    expect(deleteAccountErrorMessage(failure(404))).toContain('Nothing was deleted');
  });

  it('is clear that the data is already gone when only the sign-in account remained', () => {
    expect(deleteAccountErrorMessage(failure(502))).toContain('Your data is deleted');
  });

  it('shows the status for anything else', () => {
    expect(deleteAccountErrorMessage(failure(500))).toBe('The account could not be deleted. (500)');
  });

  it('never repeats what the server wrote', () => {
    for (const status of [0, 401, 404, 429, 500, 502]) {
      expect(deleteAccountErrorMessage(failure(status))).not.toContain('raw server text');
    }
  });

  it('copes with something that is not an HTTP error', () => {
    expect(deleteAccountErrorMessage(new Error('boom'))).toBe('The account could not be deleted.');
  });
});
