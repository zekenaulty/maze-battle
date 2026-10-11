import { cleanup, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useExploreKeys } from './useExploreKeys';
import { useGameLoop } from './useGameLoop';

afterEach(() => { cleanup(); document.body.replaceChildren(); });
describe('native keyboard ownership', () => {
  it('ignores editing, modifiers, prevented events and repeated voluntary actions', () => {
    const action = vi.fn(), transition = vi.fn(), takeover = vi.fn();
    renderHook(() => {
      useExploreKeys(false, { interact: action, map: action, inventory: action, portal: action, stop: action });
      useGameLoop(undefined, false, transition, takeover);
    });
    for (const key of ['e', 'm', 'i', 't', 'w', 'ArrowRight']) {
      for (const modifier of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey']) fireEvent.keyDown(window, { key, [modifier]: true });
      const prevented = new KeyboardEvent('keydown', { key, cancelable: true });
      prevented.preventDefault(); window.dispatchEvent(prevented);
      for (const tag of ['input', 'textarea', 'select', 'div']) {
        const element = document.createElement(tag);
        if (tag === 'div') element.setAttribute('contenteditable', 'true');
        document.body.append(element);
        fireEvent.keyDown(element, { key });
        element.remove();
      }
    }
    for (const key of ['e', 'm', 'i', 't']) fireEvent.keyDown(window, { key, repeat: true });
    expect(action).not.toHaveBeenCalled(); expect(transition).not.toHaveBeenCalled();
    for (const key of ['e', 'm', 'i', 't']) fireEvent.keyDown(window, { key });
    fireEvent.keyDown(window, { key: 'w', repeat: true });
    expect(action).toHaveBeenCalledTimes(4); expect(transition).toHaveBeenCalledOnce(); expect(takeover).toHaveBeenCalledOnce();
  });
});
