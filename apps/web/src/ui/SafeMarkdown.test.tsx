import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { SafeMarkdown } from './SafeMarkdown';

describe('SafeMarkdown', () => {
  it('never renders HTML from content', () => {
    const { container } = render(<SafeMarkdown text={'<img src=x onerror="alert(1)"><script>alert(2)</script>\n**bold** [x](javascript:alert(3))'} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<script>alert(2)</script>');
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
  });
  it('renders lists, checklists and only http(s) links', () => {
    const { container } = render(<SafeMarkdown text={'# Title\n- [x] done\n- [ ] todo\n1. first\nSee https://example.com/a'} />);
    expect(container.querySelectorAll('input[type=checkbox]')).toHaveLength(2);
    expect(container.querySelector('ol li')?.textContent).toBe('first');
    const a = container.querySelector('a')!;
    expect(a.getAttribute('href')).toBe('https://example.com/a');
    expect(a.getAttribute('rel')).toContain('noopener');
  });
});
