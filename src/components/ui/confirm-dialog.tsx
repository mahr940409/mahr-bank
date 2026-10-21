import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function ConfirmDialog({ open, onOpenChange, title = 'Confirmar acción', description, confirmLabel = 'Confirmar', destructive = false, onConfirm }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
        <Button variant={destructive ? 'destructive' : 'default'} onClick={async () => { await onConfirm(); onOpenChange(false); }}>{confirmLabel}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
