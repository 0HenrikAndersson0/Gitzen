import { describe, it, expect } from 'vitest';
import { isEqualArray } from './utils';

describe('isEqualArray', () => {
  it('should return true for same reference', () => {
    const arr = [1, 2, 3];
    expect(isEqualArray(arr, arr)).toBe(true);
  });

  it('should return true for empty arrays', () => {
    expect(isEqualArray([], [])).toBe(true);
  });

  it('should return false for different lengths', () => {
    expect(isEqualArray([1], [1, 2])).toBe(false);
  });

  it('should return false for null or undefined', () => {
    expect(isEqualArray([1], null as any)).toBe(false);
    expect(isEqualArray(null as any, [1])).toBe(false);
  });

  it('should return true if first and last elements match (the "cheap" assumption)', () => {
    const arr1 = [{ id: '1' }, { id: '2' }, { id: '3' }];
    const arr2 = [{ id: '1' }, { id: '2' }, { id: '3' }];
    expect(isEqualArray(arr1, arr2)).toBe(true);
  });

  it('should return false if first elements do not match', () => {
    const arr1 = [{ id: '0' }, { id: '2' }, { id: '3' }];
    const arr2 = [{ id: '1' }, { id: '2' }, { id: '3' }];
    expect(isEqualArray(arr1, arr2)).toBe(false);
  });

  it('should return false if last elements do not match', () => {
    const arr1 = [{ id: '1' }, { id: '2' }, { id: '4' }];
    const arr2 = [{ id: '1' }, { id: '2' }, { id: '3' }];
    expect(isEqualArray(arr1, arr2)).toBe(false);
  });

  it('should return true even if middle elements changed (LIMITATION)', () => {
    // This demonstrates the limitation of the cheap check
    const arr1 = [{ id: '1' }, { id: 'changed' }, { id: '3' }];
    const arr2 = [{ id: '1' }, { id: '2' }, { id: '3' }];
    expect(isEqualArray(arr1, arr2)).toBe(true);
  });
});
