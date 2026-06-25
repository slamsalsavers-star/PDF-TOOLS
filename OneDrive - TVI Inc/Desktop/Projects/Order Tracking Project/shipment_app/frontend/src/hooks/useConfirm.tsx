import { useState } from 'react';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';

interface Options {
  title?: string;
  message: string;
  confirmLabel?: string;
}

export function useConfirm() {
  const [state, setState] = useState<{ open: boolean; resolve?: (val: boolean) => void; opts?: Options }>({ open: false });

  const confirm = (opts: Options) =>
    new Promise<boolean>(resolve => setState({ open: true, resolve, opts }));

  const handleClose = (val: boolean) => {
    state.resolve?.(val);
    setState({ open: false });
  };

  const Dialog = () => state.open ? (
    <Modal open={state.open} onClose={() => handleClose(false)} title={state.opts?.title ?? 'Confirm'} size="sm">
      <p className="text-gray-600 mb-6">{state.opts?.message}</p>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={() => handleClose(false)}>Cancel</Button>
        <Button variant="danger" onClick={() => handleClose(true)}>{state.opts?.confirmLabel ?? 'Delete'}</Button>
      </div>
    </Modal>
  ) : null;

  return { confirm, Dialog };
}
