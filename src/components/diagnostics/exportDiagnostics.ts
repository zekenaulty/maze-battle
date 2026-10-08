import type { GameState } from '../../domain/types';
import type { PlayTelemetry } from '../../domain/telemetry/types';
import { METRIC_SEMANTICS } from '../../domain/telemetry/types';
import { inventoryDiagnostics } from '../../domain/items/inventoryDiagnostics';

export function downloadDiagnostics(game: GameState, telemetry: PlayTelemetry) {
  downloadJson(`maze-battle-floor-${game.dungeonLevel}-diagnostics.json`, {
    format: 'maze-battle-diagnostics-v1', exportedAt: new Date().toISOString(),
    metricSemantics: METRIC_SEMANTICS,
    inventoryDiagnostics: inventoryDiagnostics(game),
    environment: { userAgent: navigator.userAgent, viewport: { width: innerWidth, height: innerHeight } },
    telemetry, snapshot: game,
  });
}

export function downloadJson(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
