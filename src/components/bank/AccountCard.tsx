import { useState } from 'react';
import { Account } from '@/types/bank';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Building2, User, Globe, Pencil, Check, X, Wallet, Trash2 } from 'lucide-react';
import { formatNumber } from '@/lib/currencyUtils';
import { getBankSettings } from '@/hooks/useBankSettings';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface AccountCardProps {
  account: Account;
  availableForWithdrawal?: number;
  withdrawalRestriction?: string;
  onClick?: () => void;
  onEditName?: (accountId: string, newName: string) => void;
  onDelete?: (accountId: string) => void;
}

export function AccountCard({ account, availableForWithdrawal, withdrawalRestriction, onClick, onEditName, onDelete }: AccountCardProps) {
  const isMainBank = account.id === 'bank-main';
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(account.userName);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (editName.trim() && onEditName) {
      onEditName(account.id, editName.trim());
    }
    setIsEditing(false);
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditName(account.userName);
    setIsEditing(false);
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditName(account.userName);
    setIsEditing(true);
  };

  return (
    <Card
      className={`group transition-all hover:shadow-md cursor-pointer ${isMainBank ? 'border-accent' : ''}`}
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 flex-1 min-w-0">
            {isEditing ? (
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-7 text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSave(e as any);
                    if (e.key === 'Escape') handleCancel(e as any);
                  }}
                />
                <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleSave}>
                  <Check className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleCancel}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <CardTitle className="text-lg flex items-start gap-2">
                {account.type === 'business' ? (
                  <Building2 className="h-4 w-4 text-primary shrink-0 mt-1" />
                ) : (
                  <User className="h-4 w-4 text-primary shrink-0 mt-1" />
                )}
                <span
                  className="break-words whitespace-normal min-w-0 flex-1 leading-tight"
                  title={account.userName}
                >
                  {account.userName}
                </span>
              </CardTitle>
            )}
            <CardDescription className="text-xs">
              {account.accountNumber}
            </CardDescription>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Badge variant={account.type === 'business' ? 'default' : 'secondary'}>
              {account.type === 'business' ? 'Empresarial' : 'Personal'}
            </Badge>
            {account.countryName && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Globe className="h-3 w-3" />
                {account.countryName}
              </span>
            )}
          </div>
        </div>
        {!isEditing && !isMainBank && (onEditName || onDelete) && (
          <div className="flex items-center justify-end gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
            {onEditName && (
              <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={handleEditClick}>
                <Pencil className="h-3 w-3" />
              </Button>
            )}
            {onDelete && (
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 shrink-0 text-destructive hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete(true);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-center">
          <p className="text-muted-foreground text-xs">Balance ({account.currency})</p>
          <p className="font-bold text-2xl text-foreground">
            {formatNumber(account.balance)}
          </p>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <Wallet className="h-3 w-3 mr-1" />
              Máximo a retirar
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-64"
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const settings = getBankSettings();
              // El retiro no cobra comisión propia, pero si la cuenta es empresarial
              // un eventual movimiento de salida podría tener comisión.
              const isBusiness = account.type === 'business';
              const rate = isBusiness ? settings.businessTransferCommission : 0;
              // Máximo retirable considerando comisión: balance / (1 + rate)
              const grossAvailable = availableForWithdrawal ?? account.balance;
              const maxWithdrawable = grossAvailable / (1 + rate);
              const commission = account.balance - maxWithdrawable;
              return (
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Saldo total:</span>
                    <span className="font-medium">{formatNumber(account.balance)} {account.currency}</span>
                  </div>
                  {availableForWithdrawal === undefined && <div className="flex justify-between">
                    <span className="text-muted-foreground">Comisión ({(rate * 100).toFixed(1)}%):</span>
                    <span className="font-medium">{formatNumber(commission)} {account.currency}</span>
                  </div>}
                  <div className="flex justify-between border-t pt-2">
                    <span className="font-semibold">Máx. a retirar:</span>
                    <span className="font-bold text-primary">{formatNumber(maxWithdrawable)} {account.currency}</span>
                  </div>
                  {withdrawalRestriction && <div className="text-muted-foreground pt-1 border-t">{withdrawalRestriction}</div>}
                  {!isMainBank && (
                    <div className="text-muted-foreground pt-1 border-t">
                      Cuota mensual: {formatNumber(account.monthlyFee)} PDH
                    </div>
                  )}
                </div>
              );
            })()}
          </PopoverContent>
        </Popover>
        {!isMainBank && (
          <div className="pt-2 border-t text-xs text-muted-foreground">
            Cuota mensual: {formatNumber(account.monthlyFee)} PDH
          </div>
        )}
      </CardContent>
      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title="Eliminar cuenta" description={`¿Eliminar la cuenta "${account.userName}"? La cuenta debe tener saldo 0.`} confirmLabel="Eliminar" destructive onConfirm={async () => { onDelete?.(account.id); }} />
    </Card>
  );
}
