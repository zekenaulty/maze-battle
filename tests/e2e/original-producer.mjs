import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

export const legacyRevision = 'b5b91cdc2fded213b19319fd55c21259b608067e';

export async function produceOriginalFixtures(page) {
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', legacyRevision], { encoding: 'utf8' }).trim().split('\n');
  await page.route('**/*', async (route) => {
    const path = new URL(route.request().url()).pathname.slice(1);
    if (path === 'original-producer') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head></head><body></body></html>' });
    if (!files.includes(path)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: path.endsWith('.js') ? 'application/javascript' : 'text/css', body: execFileSync('git', ['show', `${legacyRevision}:${path}`], { encoding: 'utf8' }) });
  });
  await page.goto('http://127.0.0.1:5181/original-producer');
  return page.evaluate(async (revision) => {
    const { GameLevel } = await import('/battle/gameLevel.js');
    const { SaveData } = await import('/battle/saveData.js');
    let seed = 9137;
    Math.random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
    const game = new GameLevel();
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 600;
    game.initialize(600, 600, canvas.getContext('2d'));
    const firstSave = new Promise((resolve) => game.listenToEvent('saved', resolve));
    game.begin(true);
    await firstSave;
    const snapshot = (name) => {
      SaveData.save(game, name);
      return {
        legacyRevision: revision,
        state: JSON.parse(localStorage.getItem(SaveData.slotName(name))),
        expected: [game.warrior, game.mage, game.healer].map((actor) => ({
          role: actor.name, level: actor.level.level, xp: actor.level.xp,
          hp: actor.attributes.hp, maxHp: actor.attributes.maxHp,
          mp: actor.attributes.mp, maxMp: actor.attributes.maxMp,
          gold: actor.inventory.gold, autoBattle: actor.autoBattle,
          attributes: {
            strength: actor.attributes.strength + actor.attributes.strengthLevel,
            vitality: actor.attributes.vitality + actor.attributes.vitalityLevel,
            intellect: actor.attributes.intellect + actor.attributes.intellectLevel,
            available: actor.attributes.available,
          },
          combat: { baseDamage: actor.attributes.baseDamage + actor.attributes.baseDamageLevel, scaleWith: actor.attributes.scaleWith },
        })),
      };
    };
    const fresh = snapshot('Fresh');
    game.loadState({ ...fresh.state, level: 7, mazeMaxRooms: 155, randomBattles: false });
    const saved = game.saveState();
    const start = saved.maze.active;
    const cell = saved.maze.cells.find((cell) => cell.row === start.row && cell.column === start.column);
    const next = cell.links.items[0];
    const direction = next.row < start.row ? 'north' : next.row > start.row ? 'south' : next.column > start.column ? 'east' : 'west';
    const moved = new Promise((resolve) => game.listenToEvent('moved', resolve));
    game.move(direction);
    await moved;
    [game.warrior, game.mage, game.healer].forEach((actor, index) => {
      while (actor.level.level < [25, 20, 17][index]) actor.level.levelUp();
      actor.attributes.baseHp += 3;
      actor.attributes.baseMp += 4;
      actor.attributes.baseDamage += 2;
      actor.buyAttribute('vitality');
      actor.buyAttribute(actor.attributes.scaleWith);
      actor.level.xp = 17 + index;
      actor.inventory.addGold([137, 91, 137][index]);
      actor.recover();
      actor.takeDamage(23 + index);
      actor.spendMp(Math.min(11, actor.attributes.mp));
      actor.autoBattle = index !== 1;
    });
    return { fresh, advanced: snapshot('Advanced') };
  }, legacyRevision);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const browser = await chromium.launch(existsSync(path) ? { executablePath: path } : {});
  try {
    const context = await browser.newContext();
    const fixtures = await produceOriginalFixtures(await context.newPage());
    const directory = new URL('../fixtures/original-saves/', import.meta.url);
    mkdirSync(directory, { recursive: true });
    for (const [name, fixture] of Object.entries(fixtures)) {
      writeFileSync(new URL(`${name}.json`, directory), JSON.stringify(fixture, null, 2) + '\n');
    }
    console.log('Produced fresh and advanced fixtures with original GameLevel.saveState / SaveData.save.');
  } finally { await browser.close(); }
}
