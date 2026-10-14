// Tarjetas (fork fsrhome): la hoja que abre cada tipo de tarjeta. Una sola hoja abierta a la vez: abrir una cierra las
// demás (así la de Dinero suelta sus montos). Puro, con pruebas.
import type { CardType, DisplayCardRef } from '../shared/types';
import type { SheetLike } from './widgets/cards';

export class SheetSwitch implements SheetLike {
  constructor(private byType: Partial<Record<CardType, SheetLike>>, private fallback: SheetLike) {}

  private all(): SheetLike[] {
    return [this.fallback, ...Object.values(this.byType).filter((s): s is SheetLike => !!s)];
  }

  get isOpen(): boolean {
    return this.all().some((s) => s.isOpen);
  }

  open(ref: DisplayCardRef): void {
    this.close();
    (this.byType[ref.type] ?? this.fallback).open(ref);
  }

  close(): void {
    for (const s of this.all()) s.close();
  }
}
