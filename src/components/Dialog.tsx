import type { ReactNode } from 'react';
import { X } from 'lucide-react';

interface DialogProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
}

export function Dialog({ title, children, onClose }: DialogProps) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <header>
          <h2 id="dialog-title">{title}</h2>
          <button type="button" aria-label="Close dialog" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
