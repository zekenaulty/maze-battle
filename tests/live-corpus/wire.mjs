export function observeWire(page, budget, serviceOrigin = 'http://127.0.0.1:5078') {
  const wire = { sent: [], received: [], http: [], errors: [], console: [], stopReason: null };
  page.on('pageerror', error => wire.errors.push(error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) wire.console.push(message.text()); });
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin === serviceOrigin) wire.http.push({ method: request.method(),
      url: request.url(), body: request.postData() ? request.postDataJSON() : null });
  });
  page.on('websocket', socket => {
    if (socket.url() !== serviceOrigin.replace('http:', 'ws:') + '/api/host') return;
    socket.on('framesent', event => {
      try { wire.sent.push({ at: Date.now(), frame: JSON.parse(String(event.payload)) }); }
      catch (error) { wire.errors.push(String(error)); }
    });
    socket.on('framereceived', event => {
      try {
        const frame = JSON.parse(String(event.payload));
        if (frame.type === 'progress' && frame.payload?.record) {
          const { thoughtSummaryDelta: _summary, ...record } = frame.payload.record;
          budget.observeDrops(frame.runId, frame.payload.droppedRecords);
          budget.record(frame.runId, record);
          wire.received.push({ at: Date.now(), frame: { ...frame, payload: { ...frame.payload, record } } });
        } else wire.received.push({ at: Date.now(), frame });
      } catch (error) { wire.errors.push(String(error)); }
    });
  });
  return wire;
}

export async function stopThroughUi(page, started = false) {
  const dialog = page.getByRole('dialog', { name: 'Agentic play', exact: true });
  const visible = await dialog.isVisible().catch(() => false);
  if (started && !visible) throw Error('Started session cleanup UI is unavailable; recovery required');
  if (visible) {
    const stop = dialog.getByRole('button', { name: 'Stop Agentic play', exact: true });
    if (await stop.isEnabled().catch(() => false)) await stop.click({ timeout: 5000 });
    if (started) {
      await dialog.getByRole('status').first().filter({ hasText: /^stopped$/ }).waitFor({ timeout: 15_000 });
      await dialog.getByRole('button', { name: 'Recovery', exact: true }).click();
      const recovery = page.getByRole('dialog', { name: 'Agentica recovery', exact: true });
      await recovery.getByRole('button', { name: 'Stop Agentic session', exact: true }).click({ timeout: 10_000 });
      await recovery.getByRole('status').filter({ hasText: 'Root Stop acknowledged' }).waitFor({ timeout: 20_000 });
    }
  }
}
