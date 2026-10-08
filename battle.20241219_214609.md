# Directory Snapshot

```
- battle/
  - autoPilot.js
  - dice.js
  - gameLevel.js
  - saveData.js
  - actors/
    - actor.js
    - actorAttributes.js
    - actorInventory.js
    - actorLevel.js
    - actorParty.js
    - actorSkill.js
    - enemies/
      - emoji.js
      - enemy.js
      - slime.js
      - slimes.css
    - heros/
      - healer.js
      - mage.js
      - warrior.js
    - items/
      - either.js
      - item.js
      - lootTable.js
      - medicalHerb.js
    - skills/
      - arcaneBlast.js
      - arcaneWave.js
      - attack.js
      - autoBattle.js
      - cleave.js
      - gcd.js
      - groupHeal.js
      - heal.js
      - magicMissles.js
      - resurect.js
      - slam.js
      - slash.js
      - smite.js
      - teleport.js
      - wand.js
    - ui/
      - actionbar.css
      - actionbar.js
      - characters.js
      - detailSheet.css
      - detailSheet.js
      - gauge.css
      - gauge.js
      - nameplate.css
      - nameplate.js
  - ui/
    - battle.css
    - battle.js
    - fight.js
    - saves.css
    - saves.js
    - spawner.js
```
## autoPilot.js

**Path:** `battle\autoPilot.js`

```
import { List } from '../core/list.js';
import { EventHandler } from '../core/eventHandler.js'
import { Loader } from '../ui/loader/loader.js';
import { Modal } from '../ui/modal/modal.js';

export class AutoPilot extends EventHandler {

  #loopId = -1;
  #party;
  #maze;
  #gameLevel;

  #breathMin = 650;
  #breathMax = 1250;

  #running = false;

  get running() {
    let vm = this;

    return vm.#running;
  }

  get #breath() {
    let vm = this;
    let r = Math.floor(Math.random() * vm.#breathMin);
    if (r < vm.#breathMin) {
      r = vm.#breathMin;
    }

    return r;
  }

  constructor(party, game, maze) {
    super();

    let vm = this;

    vm.defineEvent('started', 'stopped');

    vm.#party = party;

    vm.#gameLevel = game;
    vm.#maze = maze;

    vm.#party.autoBattle();
  }

  start() {
    let vm = this;

    if (vm.#running) {
      return;
    }
    vm.#running = true;
    vm.#lock = false;

    vm.raiseEvent('started');

    clearInterval(vm.#loopId);
    vm.#loopId = setInterval(() => {
      vm.#loop();
    }, vm.#breath);
  }

  #lock = false;
  #loop() {
    let vm = this;

    if (vm.#canAct) {
      vm.#lock = true;
      vm.#levelUp();
      vm.#nextMove();
      vm.#lock = false;
    }

  }

  stop() {
    let vm = this;
    if (!vm.running) {
      return;
    }

    vm.#running = false;
    clearInterval(vm.#loopId);
    vm.#lock = false;
    vm.raiseEvent('stopped');
  }

  get #canAct() {
    let vm = this;
    if (
      Modal.openCount > 0 ||
      Loader.isOpen ||
      vm.lock ||
      !vm.#running
    ) {
      return false;
    }
    return vm.#running;
  }

  #distances() {
    let vm = this;
    return vm.#maze.active.distances();
  }

  #nextMove() {
    let vm = this;
    let cells = vm.#distances().pathTo(vm.#maze.end);
    let cell = cells.items[cells.items.length - 2];
    if (cells.items.length <= 2) {
      cell = vm.#maze.end;
    }
    let dir = vm.#maze.active.directionOf(cell);

    vm.#gameLevel.move(dir);
  }

  #levelUp() {
    let vm = this;
    vm.#party.each((a) => {
      while (a.attributes.available > 0) {
        a.spendPoints();
      }
    });
  }

}

```
## dice.js

**Path:** `battle\dice.js`

```
import { List } from '../core/list.js';

export class Dice {

  constructor() {

  }

  static roll(sides) {
    return 1 + Math.floor(Math.random() * sides);
  }

  static many() {
    let dice = new List();
    if (arguments) {
      let list = Array.isArray(arguments[0]) ? arguments[0] : arguments;
      for (let i = 0; i < list.length; i++) {
        if (!Number.isNaN(list[i])) {
          dice.push(Dice.roll(list[i]));
        }
      }
    }
    return dice;
  }

  static d20() {
    return Dice.roll(20);
  }

  static d12() {
    return Dice.roll(12);
  }

  static d6() {
    return Dice.roll(6);
  }

  static coin() {
    return Dice.roll(2);
  }

}

```
## gameLevel.js

**Path:** `battle\gameLevel.js`

```
import { List } from '../core/list.js';
import { EventHandler } from '../core/eventHandler.js'
import { Alert } from '../ui/alert/alert.js';

import { Maze } from '../mazes/maze.js';
import { CanvasRectangle } from '../mazes/renderers/canvasRectangle.js';
import { CanvasRectangleScaler } from '../mazes/renderers/canvasRectangleScaler.js';
import { BinaryTree } from '../mazes/generators/binaryTree.js';
import { Sidewinder } from '../mazes/generators/sidewinder.js';
import { AldousBroder } from '../mazes/generators/aldousBroder.js';
import { Wilsons } from '../mazes/generators/wilsons.js';
import { HuntAndKill } from '../mazes/generators/huntAndKill.js';
import { RecursiveBacktracker } from '../mazes/generators/recursiveBacktracker.js';
import { SimplePrims } from '../mazes/generators/prims.js';
import { GrowingTree } from '../mazes/generators/growingTree.js';
import { DetailSheet } from './actors/ui/detailSheet.js';
import { Warrior } from './actors/heros/warrior.js';
import { Healer } from './actors/heros/healer.js';
import { Mage } from './actors/heros/mage.js';
import { Battle } from './ui/battle.js';
import { Dice } from './dice.js';
import { Loader } from '../ui/loader/loader.js';
import { SaveData } from './saveData.js';
import { AutoPilot } from './autoPilot.js';
import { Fight } from './ui/fight.js';
import { Characters } from './actors/ui/characters.js'

export class GameLevel extends EventHandler {

  #level = 0;
  #mazeMaxRooms = 8;
  #toTiny = 10;
  #roomGrowthFactor = 0.3;

  #scaler;
  #renderer;
  #maze;
  #generators;

  #breath = 250;

  #warrior;
  #healer;
  #mage;

  #warriorDetail;
  #healerDetail;
  #mageDetail;

  autoPilot;
  fight;
  
  randomBattles = true;

  constructor() {
    super();
    let vm = this;

    vm.defineEvent(
      'game over',
      'won battle',
      'completed level',
      'saved',
      'loaded save',
      'moved',
      'updated',
      'teleporting',
      'teleported',
      'bind'
    );

  }

  get warrior() {
    let vm = this;
    return vm.#warrior;
  }

  get healer() {
    let vm = this;
    return vm.#healer;
  }

  get mage() {
    let vm = this;
    return vm.#mage;
  }

  get warriorDetail() {
    let vm = this;
    return vm.#warriorDetail;
  }

  get healerDetail() {
    let vm = this;
    return vm.#healerDetail;
  }

  get mageDetail() {
    let vm = this;
    return vm.#mageDetail;
  }

  saveState() {

    let vm = this;
    let warriorState = vm.#warrior.saveState();
    let healerState = vm.#healer.saveState();
    let mageState = vm.#mage.saveState();
    let mazeState = vm.#maze.saveState();
    let state = {
      level: vm.#level,
      mazeMaxRooms: vm.#mazeMaxRooms,
      toTiny: vm.#toTiny,
      roomGrowthFactor: vm.#roomGrowthFactor,
      warrior: warriorState,
      healer: healerState,
      mage: mageState,
      maze: mazeState,      
      randomBattles: vm.randomBattles,
      summary: vm.summary,
    };
    
    vm.raiseEvent('saved', vm);

    return state;
  }

  loadState(state) {
    let vm = this;

    if (vm.autoPilot) {
      vm.autoPilot.stop();
    }

    if (vm.fight) {
      vm.fight.stop();
    }

    Loader.open(`LEVEL ${state.level}`);

    let warriorState = state.warrior;
    let healerState = state.healer;
    let mageState = state.mage;
    let mazeState = state.maze;

    vm.randomBattles = state.randomBattles;
    vm.#level = state.level;
    vm.#mazeMaxRooms = state.mazeMaxRooms;
    vm.#roomGrowthFactor = state.roomGrowthFactor;

    vm.#resetMaze();

    vm.#warrior.reset();
    vm.#healer.reset();
    vm.#mage.reset();

    vm.#warrior.loadState(warriorState);
    vm.#healer.loadState(healerState);
    vm.#mage.loadState(mageState);
    vm.#maze.loadState(mazeState);

    vm.#renderer.draw();

    Loader.close(350);
    vm.raiseEvent('updated', vm);
    vm.raiseEvent('loaded save', vm);
  }

  get level() {
    let vm = this;
    return vm.#level;
  }

  get summary() {
    let vm = this;
    return `
      <span><span class="bolder">Dungeon Level: </span>${vm.level}</span>
      <span class="small-text"><span class="bolder pl-1">${vm.#warrior.displayName} Level: </span>${vm.#warrior.level.level}</span>
      <span class="small-text"><span class="bolder pl-1">${vm.#mage.displayName} Level: </span>${vm.#mage.level.level}</span>
      <span class="small-text"><span class="bolder pl-1">${vm.#healer.displayName} Level: </span>${vm.#healer.level.level}</span>
      `;
  }

  isWarrior(actor) {
    let vm = this;
    return actor === vm.#warrior;
  }

  isHealer(actor) {
    let vm = this;
    return actor === vm.#healer;
  }

  isMage(actor) {
    let vm = this;
    return actor === vm.#mage;
  }

  isHero(actor) {
    let vm = this;
    return vm.isWarrior(actor) || vm.isHealer(actor) || vm.isMage(actor);
  }

  initialize(width, height, gfx) {
    let vm = this;
    vm.#scaler = new CanvasRectangleScaler(width, height);
    vm.#maze = new Maze(vm.#scaler.rows, vm.#scaler.columns);
    vm.#renderer = new CanvasRectangle(vm, vm.#maze, vm.#scaler, gfx);

    vm.#loadGenerators();

  }

  begin(newGame = false) {
    let vm = this;
    let saved = SaveData.getState();

    Characters.characters = undefined;

    vm.#warrior = new Warrior(vm);
    vm.#healer = new Healer(vm);
    vm.#mage = new Mage(vm);

    vm.#warrior.party.add(vm.#mage);
    vm.#warrior.party.add(vm.#healer);

    vm.#healer.party.add(vm.#mage);
    vm.#healer.party.add(vm.#warrior);

    vm.#mage.party.add(vm.#healer);
    vm.#mage.party.add(vm.#warrior);

    vm.#warriorDetail = new DetailSheet(vm.#warrior, true);
    vm.#healerDetail = new DetailSheet(vm.#healer, true);
    vm.#mageDetail = new DetailSheet(vm.#mage, true);

    vm.autoPilot = new AutoPilot(vm.#warrior.party, vm, vm.#maze);
    vm.fight = new Fight(vm.#warrior.party, vm);

    vm.#maze.listenToEvent('solved', () => {
      vm.#nextLevel();
    });

    vm.autoPilot.listenToEvent('stopped', () => {
      vm.raiseEvent('updated', vm);
    });

    vm.fight.listenToEvent('stopped', () => {
      vm.raiseEvent('updated', vm);
    });


    if (saved && !newGame) {
      vm.loadState(saved);
    } else {
      vm.#firstLevel();
    }
    
    vm.raiseEvent('bind', vm);

  }

  solve() {
    let vm = this;
    if (!vm.#renderer.showSolution) {
      vm.#renderer.revealSolution();
    } else {
      vm.#renderer.hideSolution();
    }
  }

  warriorInfo() {
    let vm = this;
    vm.#warriorDetail.open(true);
  }

  healerInfo() {
    let vm = this;
    vm.#healerDetail.open(true);
  }

  mageInfo() {
    let vm = this;
    vm.#mageDetail.open(true);
  }

  #randomMaze() {
    let vm = this;
    Loader.open(`LEVEL ${vm.level}`);
    setTimeout(() => {
      vm.#randomGenerator().generate();
    }, vm.#breath);
  }

  #firstLevel() {
    let vm = this;
    vm.#level = 1;
    vm.#mazeMaxRooms = 32;
    vm.#resetMaze();
    vm.#randomMaze();

    vm.#warrior.reset();
    vm.#healer.reset();
    vm.#mage.reset();

    vm.raiseEvent('updated', vm);

    if (vm.autoPilot) {
      vm.autoPilot.stop();
    }

    if (vm.fight) {
      vm.fight.stop();
    }

  }

  #nextLevel() {
    let vm = this;

    vm.#level++;
    vm.#mazeMaxRooms += Math.ceil(vm.#mazeMaxRooms * vm.#roomGrowthFactor);
    vm.#resetMaze();
    vm.#randomMaze();
    vm.#warrior.recover();
    vm.#healer.recover();
    vm.#mage.recover();

    vm.raiseEvent('updated', vm);
  }

  #resetMaze() {
    let vm = this;

    vm.#scaler.setScaleBounds(vm.#mazeMaxRooms, vm.#toTiny);
    vm.#scaler.calc();
    vm.#maze.resize(vm.#scaler.rows, vm.#scaler.columns);

  }

  #randomGenerator() {
    let vm = this;
    return vm.#generators.sample();
  }

  #loadGenerators() {
    let vm = this;
    vm.#generators = new List();
    /* 
    vm.#generators.push(new BinaryTree(vm.#maze));
    vm.#generators.push(new Sidewinder(vm.#maze));
    */
    vm.#generators.push(new AldousBroder(vm.#maze));
    vm.#generators.push(new Wilsons(vm.#maze));
    vm.#generators.push(new HuntAndKill(vm.#maze));
    vm.#generators.push(new RecursiveBacktracker(vm.#maze));
    vm.#generators.push(new SimplePrims(vm.#maze));
    vm.#generators.push(new GrowingTree(vm.#maze));

    vm.#generators.forEach((g) => {
      g.listenToEvent('generated', () => {
        setTimeout(() => {
            Loader.open(`LEVEL ${vm.level}`);
            vm.#renderer.draw();
            Loader.close(350);
            SaveData.save(vm);
            vm.raiseEvent('updated', vm);
          },
          vm.#breath
        );
      });
    });
  }

  move(d) {
    let vm = this;
    setTimeout(() => {

      if (vm.#maze.move(d)) {
        vm.raiseEvent('moved', vm);
        SaveData.save(vm);
      } else {
        return;
      }

      if (vm.#maze.active == vm.#maze.end || vm.#maze.active == vm.#maze.start) {
        return;
      }

      let dice = Dice.many(20, 20, 20, 20, 100, 100);
      if (vm.#shouldBattle(dice)) {
        Loader.open('BATTLE');
        setTimeout(() => {
          vm.fight.start(true);
        }, 100);
      } else if (vm.#shouldTeleport(dice)) {
        vm.teleport();
      }

      vm.raiseEvent('updated', vm);
    }, 100);

  }

  teleport() {
    let vm = this;
    vm.raiseEvent('teleporting', vm);
    let f = vm.#maze.cell(vm.#maze.active.row, vm.#maze.active.column);
    let n = vm.#maze.cells.sample();
    while (n === vm.#maze.end || n === vm.#maze.active) {
      n = vm.#maze.cells.sample();
    }
    vm.#maze.active = n;
    SaveData.save(vm);
    vm.raiseEvent('teleported', f, n, vm.#maze);
  }

  #shouldBattle(d) {
    let vm = this;
    return vm.randomBattles && d[0] > 11 && d[1] < 11 && d[2] > 2 && d[3] < 20;
  }

  #shouldTeleport(d) {
    return d[0] > 18 &&
      d[1] > 10 &&
      d[2] > 10 &&
      d[3] > 10 &&
      d[4] > 75 &&
      d[5] < 25;
  }

  gameOver() {
    let vm = this;
    vm.fight.stop();
    vm.autoPilot.stop();
    vm.raiseEvent('game over', vm);
    vm.raiseEvent('updated', vm);
    vm.#firstLevel();
    Alert.popup('GAME OVER');
  }

  histogram() {
    let vm = this;
    vm.#renderer.histogram();
  }


}

```
## saveData.js

**Path:** `battle\saveData.js`

```
export class SaveData {

  static #slots = 'DC-GAME-SAVE-SLOTS';

  static addSlot(slot = 'auto') {
    let slots = JSON.parse(localStorage.getItem(SaveData.#slots));
    if (!slots) {
      slots = new Array();
    }

    if (!slots.includes(slot)) {
      slots.push(slot);
    }

    localStorage.setItem(SaveData.#slots, JSON.stringify(slots));
  }

  static getSlots() {
    return JSON.parse(localStorage.getItem(SaveData.#slots));
  }

  static slotName(useSlot = 'auto') {
    let slot = useSlot.toUpperCase();
    return `DC-GAME-${slot}`;
  }

  static save(game, useSlot = 'auto') {
    SaveData.addSlot(useSlot);
    localStorage.setItem(
      SaveData.slotName(useSlot),
      JSON.stringify(
        game.saveState()
      ));
  }

  static load(game, useSlot = 'auto') {
    game.loadState(SaveData.getState(useSlot));
  }

  static getState(useSlot = 'auto') {
    return JSON.parse(
      localStorage.getItem(
        SaveData.slotName(useSlot)
      ));
  }

  static remove(slot) {
    let slots = SaveData.getSlots().filter((e) => {
      return slot != e;
    });
    localStorage.setItem(SaveData.#slots, JSON.stringify(slots));
    localStorage.removeItem(SaveData.slotName(slot));
  }

}

```
## actors\actor.js

**Path:** `battle\actors\actor.js`

```
import { List } from '../../core/list.js';
import { EventHandler } from '../../core/eventHandler.js'
import { ActorSkill } from './actorSkill.js';
import { ActorLevel } from './actorLevel.js';
import { ActorAttributes } from './actorAttributes.js';
import { ActorInventory } from './actorInventory.js';
import { ActorParty } from './actorParty.js';
import { Attack } from './skills/attack.js';
import { GCD } from './skills/gcd.js';
import { Modal } from '../../ui/modal/modal.js';

export class Actor extends EventHandler {

  name = 'base actor';
  attributes;
  level;
  inventory;
  skills = {};
  target;
  friendlyTarget;
  enemies = new List();
  casting;
  gameLevel;
  battle;
  autoBattle = true;
  party;
  displayName;
  #aiId = -1;
  aiIntervalMin = 550;
  aiIntervalMax = 1250;
  id;
  
  static #sequence = 0

  constructor(gameLevel) {
    super();
    let vm = this;

    vm.gameLevel = gameLevel;

    vm.level = new ActorLevel(vm);
    vm.attributes = new ActorAttributes(vm);
    vm.inventory = new ActorInventory(vm);
    vm.party = new ActorParty(vm);

    vm.defineEvent(
      'actor constructed',
      'leveled up',
      'healed',
      'damaged',
      'death',
      'begin cast',
      'end cast',
      'begin recoil',
      'end recoil',
      'interupted',
      'begin gcd',
      'end gcd',
      'changed'
    );

    vm.addSkill('GCD', new GCD(vm));
    vm.addSkill('attack', new Attack(vm));

    vm.raiseEvent('actor constructed', vm);

  }

  spendMp(amt) {
    let vm = this;
    if (amt <= vm.attributes.mp) {
      vm.attributes.mp -= amt;
      vm.raiseEvent('changed', vm);
      return true
    }

    return false;
  }

  heal(amt) {
    let vm = this;
    let hp = vm.attributes.hp + amt;
    let over = 0;
    if (vm.attributes.maxHp < hp) {
      over = hp - vm.attributes.maxHp;
      vm.attributes.hp += (amt - over);
    } else {
      vm.attributes.hp += amt;
    }
    vm.raiseEvent('healed', vm, amt, over);
    vm.raiseEvent('changed', vm);
  }

  takeDamage(dmg) {
    let vm = this;
    vm.attributes.hp -= dmg;
    vm.raiseEvent('damaged', vm, dmg);
    vm.raiseEvent('changed', vm);
    if (vm.attributes.hp < 1) {
      vm.attributes.hp = 0;
      vm.raiseEvent(
        'death',
        vm
      );
    }
  }

  addSkill(key, skill) {
    let vm = this;
    vm.skills[key] = skill;

    skill.listenToEvent('begin cast', (n) => {
      n.actor.raiseEvent('begin cast', n);
    });

    skill.listenToEvent('end cast', (n) => {
      n.actor.raiseEvent('end cast', n);
    });

    skill.listenToEvent('begin recoil', (n) => {
      n.actor.raiseEvent('begin recoil', n);
    });

    skill.listenToEvent('end recoil', (n) => {
      n.actor.raiseEvent('end recoil', n);
    });

    skill.listenToEvent('interupted', (n) => {
      n.actor.raiseEvent('interupted', n);
    });

  }

  get ascii() {
    return '';
  }

  getTarget(hostile = true) {
    let vm = this;
    if (vm.target && hostile && vm.target.attributes.hp > 1 && vm.enemies.includes(vm.target)) {
      return vm.target;
    }
    return hostile ? vm.enemies.sample() : vm.party.random();
  }

  recover() {
    let vm = this;

    vm.attributes.hp = vm.attributes.maxHp;
    vm.attributes.mp = vm.attributes.maxMp;

    vm.raiseEvent('changed', vm);
  }

  lowHealth(p = 0.3) {
    let vm = this;
    let low = Math.floor(vm.attributes.maxHp * p);
    return vm.attributes.hp <= low;
  }

  lowMana(p = 0.3) {
    let vm = this;
    let low = Math.floor(vm.attributes.maxMp * p);
    return vm.attributes.mp <= low;
  }


  reset() {}

  buyAttribute(attributeName) {
    let vm = this;
    let a = attributeName.toLowerCase();
    let allowed = [
      'strength',
      'vitality',
      'intellect'
      ];
    if (allowed.includes(a) && vm.attributes.available > 0) {
      vm.attributes.available--;
      vm.attributes[a]++;
    }
  }

  spendPoints() {}

  aiCanAct() {
    let vm = this;

    if (
      !vm.autoBattle ||
      vm.casting ||
      !vm.battle ||
      vm.battle.paused ||
      Modal.openCount > 1 ||
      vm.attributes.hp < 1
    ) {
      return false;
    }
    return true;
  }

  saveState() {
    let vm = this;
    return {
      xp: vm.level.xp,
      level: vm.level.level,
      hp: vm.attributes.hp,
      mp: vm.attributes.mp,
      gold: vm.inventory.gold,
      points: vm.attributes.available,
      strength: vm.attributes.strength,
      intellect: vm.attributes.intellect,
      vitality: vm.attributes.vitality,
      baseDamage: vm.attributes.baseDamage,
      baseHp: vm.attributes.baseHp,
      baseMp: vm.attributes.baseMp,
      pointsPerLevel: vm.attributes.pointsPerLevel,
      autoBattle: vm.autoBattle,
    }
  }

  loadState(state) {
    let vm = this;

    while (vm.level.level < state.level) {
      vm.level.levelUp();
    }

    vm.level.xp = state.xp;
    vm.attributes.hp = state.hp;
    vm.attributes.mp = state.mp;
    vm.attributes.available = state.points;
    vm.inventory.gold = state.gold;
    vm.attributes.strength = state.strength;
    vm.attributes.intellect = state.intellect;
    vm.attributes.vitality = state.vitality;
    vm.attributes.baseDamage = state.baseDamage;
    vm.attributes.baseHp = state.baseHp;
    vm.attributes.baseMp = state.baseMp;
    vm.attributes.pointsPerLevel = state.pointsPerLevel;
    vm.autoBattle = state.autoBattle;

  }

  /*  dexterity should factor 
      into these numbers 
      a.k.a. speed */
  get #aiInterval() {
    let vm = this;
    let r = Math.floor(Math.random() * vm.aiIntervalMax) + 1;
    let v = Math.floor(Math.random() * 400);
    if (r < vm.aiIntervalMin) {
      r = vm.aiIntervalMin;
    }

    return r + v;
  }

  aiLoop() {}

  checkLoop() {
    let vm = this;
    if (!vm.battle) {
      vm.stopAi();
    }
  }

  startAi() {
    let vm = this;
    vm.stopAi();
    vm.#aiId = setInterval(() => {
        vm.aiLoop();
      },
      vm.#aiInterval
    );
  }

  stopAi() {
    let vm = this;
    clearInterval(vm.#aiId);
  }

  getId() {
    let vm = this;
    Actor.#sequence++;
    vm.id = `${vm.name}_${new Date().getTime()}_${Actor.#sequence}`;
  }

}

```
## actors\actorAttributes.js

**Path:** `battle\actors\actorAttributes.js`

```
import { EventHandler } from '../../core/eventHandler.js'


export class ActorAttributes extends EventHandler {

  #actor;

  strength = 5;
  vitality = 5;
  intellect = 0;

  baseDamage = 10;
  baseHp = 10;
  baseMp = 0;

  /* 
    these are used for bonuses applied 
    from leveling. Not saved recalculated.
    
    non-calculated rewards should be applied 
    to actual base and save called 
    i.e. an item that grants a permanent bonus
  */
  baseDamageLevel = 0;
  baseHpLevel = 0;
  baseMpLevel = 0;
  strengthLevel = 0;
  vitalityLevel = 0;
  intellectLevel = 0;
  scaleWith = 'strength';

  hp;
  mp;

  available = 0;
  pointsPerLevel = 10;

  constructor(actor) {
    super();
    let vm = this;

    vm.defineEvent('changed');

    vm.#actor = actor;

    vm.hp = vm.maxHp;
    vm.mp = vm.maxMp;
  }

  get damageRange() {
    let vm = this;
    return `${vm.minDamage} - ${vm.maxDamage}`;
  }

  get health() {
    let vm = this;
    let h = vm.hp;
    if (h < 0) {
      h = 0;
    }
    return `${h}/${vm.maxHp}`;
  }

  get mana() {
    let vm = this;
    let m = vm.mp;
    if (m < 0) {
      m = 0;
    }
    return `${m}/${vm.maxMp}`;
  }

  get maxHp() {
    let vm = this;
    let v = vm.vitality + vm.vitalityLevel;
    let b = vm.baseHp + vm.baseHpLevel;
    return b + (v * 2);
  }

  get maxMp() {
    let vm = this;
    return vm.baseMp + vm.baseMpLevel + ((vm.intellect + vm.intellectLevel) * 2);
  }

  get minDamage() {
    let vm = this;
    return Math.floor((vm.baseDamage + vm.baseDamageLevel) / 6 + 1) + Math.floor((vm[vm.scaleWith] + vm[vm.scaleWith + 'Level']) / 6) + 1;
  }

  get maxDamage() {
    let vm = this;
    return vm.baseDamage + vm.baseDamageLevel + Math.ceil((vm[vm.scaleWith] + vm[vm.scaleWith + 'Level']) / 3) + 3
  }
}

```
## actors\actorInventory.js

**Path:** `battle\actors\actorInventory.js`

```
import { List } from '../../core/list.js';
import { EventHandler } from '../../core/eventHandler.js'
import { Dice } from '../dice.js';
import { Alert } from '../../ui/alert/alert.js';

export class ActorInventory extends EventHandler {

  #actor;

  gold = 0;
  items = new List();

  get maxItemSlots() {
    return 4000;
  }

  static monsterGold(
    level = 1,
    factor = 0.02,
    base = 5
  ) {
    if (Dice.roll(10) > 8) {
      let l = Math.ceil(base * level / 3);
      return l + Math.floor(l / 2 * factor);
    }
    return 0;
  }
  
  constructor(actor) {
    super();
    let vm = this;

    vm.#actor = actor;

    vm.defineEvent(
      'inventory full',
      'item added',
      'item dropped',
      'gold added',
      'gold lost'
    );
  }

  addItem(item) {
    let vm = this;
    if (vm.items.length === vm.maxItemSlots - 1) {
      vm.raiseEvent(
        'inventory full',
        {
          inventory: vm,
          actor: vm.#actor,
          item: item
        });
    }
  }

  addGold(amount) {
    let vm = this;
    vm.gold += amount;
    vm.raiseEvent(
      'gold added',
      {
        inventory: vm,
        actor: vm.#actor,
        amount: amount
      });
  }

  loseGold(amount) {
    let vm = this;
    vm.gold -= amount;
    vm.raiseEvent(
      'gold lost',
      {
        inventory: vm,
        actor: vm.#actor,
        amount: amount
      });
  }

}

```
## actors\actorLevel.js

**Path:** `battle\actors\actorLevel.js`

```
import { EventHandler } from '../../core/eventHandler.js'

export class ActorLevel extends EventHandler {

  #actor;

  level = 1;
  toLevelXp = 25;
  xp = 0;

  static xpForNextLevel(
    level = 1,
    factor = 0.07,
    base = 50
  ) {
    let l = Math.ceil(base * level);
    return l + Math.floor(l * factor);
  }

  static monsterXp(
    level = 1,
    factor = 0.02,
    base = 5
  ) {
    let l = Math.ceil(base * level / 3);
    return l + Math.floor(l / 2 * factor);
  }

  constructor(actor) {
    super();
    let vm = this;

    vm.#actor = actor;

    vm.defineEvent(
      'leveled up',
      'gained xp',
      'lost xp'
    );
  }

  get xpRequired() {
    let vm = this;
    return `${vm.xp}/${vm.toLevelXp} (${vm.toLevelXp - vm.xp})`;
  }

  addXp(amount) {
    let vm = this;
    vm.xp += amount;
    while (vm.xp >= vm.toLevelXp) {
      vm.levelUp();
    }
    vm.raiseEvent(
      'gained xp',
      {
        level: vm,
        actor: vm.#actor,
        amount: amount
      });
  }

  levelUp() {
    let vm = this;
    vm.level++;
    vm.#actor.attributes.available += vm.#actor.attributes.pointsPerLevel;
    vm.#actor.recover();

    vm.xp = vm.toLevelXp - vm.xp;
    if(vm.xp < 0) {
      vm.xp = 0;
    }
    
    vm.toLevelXp = ActorLevel.xpForNextLevel(
      vm.level,
      vm.xpFactor,
      vm.baseXpToLevel
    );

    vm.raiseEvent(
      'leveled up',
      {
        level: vm,
        actor: vm.#actor
      });

    vm.#actor.raiseEvent(
      'leveled up',
      {
        level: vm,
        actor: vm.#actor
      });

    vm.#actor.recover();
  }
  
}

```
## actors\actorParty.js

**Path:** `battle\actors\actorParty.js`

```
import { List } from '../../core/list.js';
import { EventHandler } from '../../core/eventHandler.js'

export class ActorParty extends EventHandler {

  #members;
  #actor;

  constructor(actor) {
    super();

    let vm = this;

    vm.#actor = actor;
    vm.#members = new List();
    vm.#members.push(vm.#actor);

  }

  add(actor) {
    let vm = this;
    if (!vm.#members.includes(actor)) {
      vm.#members.push(actor)
    }
  }

  remove(actor) {
    let vm = this;

    vm.#members.delete(actor);
  }

  lowHealth(p = 0.65) {
    let vm = this;

    if (!vm.#members || vm.#members.length < 1) {
      return false;
    }

    let c = 0;
    vm.#members.forEach((e) => {
      if (e.lowHealth(p)) {
        c++;
      }
    });

    if (c === 0) {
      return false;
    }

    if (c === vm.#members.length) {
      return true;
    }

    let n = Math.floor(vm.#members.length * 0.4);
    if (c >= n) {
      return true;
    }
  }

  lowestHealthMember(living = true) {
    let vm = this;

    if (!vm.#members || vm.#members.length < 1) {
      return;
    }

    let a = vm.#members[0];
    for (let i = 1; i < vm.#members.length; i++) {
      let b = vm.#members[i];
      let ap = a.attributes.hp / a.attributes.maxHp * 100;
      let bp = b.attributes.hp / b.attributes.maxHp * 100;
      if (bp < ap && ((living && b.attributes.hp > 0) || !living)) {
        a = b;
      }
    }

    return a;
  }

  autoBattle(v = true) {
    let vm = this;

    vm.#members.forEach((e) => {
      e.autoBattle = v;
    });
  }

  each(action) {
    if (!action) {
      return;
    }

    let vm = this;
    vm.#members.forEach((e) => {
      action(e);
    });
  }

  first() {
    let vm = this;
    return vm.#members[0];
  }

  last() {
    let vm = this;
    return vm.#members[vm.#members.length - 1];
  }

  random() {
    let vm = this;
    return vm.#members.sample();
  }

  dead() {
    let vm = this;
    let r = true;
    vm.each((a) => {
      if (a.attributes.hp > 0) {
        r = false;
      }
    });
    return r;
  }

  firstDead() {
    let vm = this;
    for (let i = 0; i < vm.#members.length; i++) {
      if (vm.#members[i].attributes.hp < 1) {
        return vm.#members[i];
      }
    }
  }

}

```
## actors\actorSkill.js

**Path:** `battle\actors\actorSkill.js`

```
import { EventHandler } from '../../core/eventHandler.js'

export class ActorSkill extends EventHandler {
  actor;
  castTime = 250;
  recoilTime = 250;
  cooldown = 1500;
  lastUsed = 0;
  minBy = 0;
  maxBy = 0;
  lock = false;
  register = false;
  availableOutOfCombat = false;
  availableOutOfCombatOnly = false;
  bubble = true;
  triggerGcd = true;
  name = 'base skill';
  castId;
  recoilId;
  cdId;
  mpCost = 5;

  get canCast() {
    let vm = this;

    return vm.mpCost <= vm.actor.attributes.mp;
  }

  get displayName() {
    return `base skill`;
  }

  get summary() {
    return '';
  }

  get min() {
    let vm = this;
    return vm.actor.attributes.minDamage + vm.minBy;
  }

  get max() {
    let vm = this;
    return vm.actor.attributes.maxDamage + vm.maxBy;
  }

  get now() {
    return new Date().getTime();
  }

  get onCd() {
    let vm = this;
    return vm.now - vm.lastUsed < vm.cooldown;
  }

  get onGcd() {
    let vm = this;
    if (!vm.actor.skills['GCD']) {
      return false;
    }
    return vm.actor.skills['GCD'].onCd;
  }

  get isGcd() {
    let vm = this;
    return vm === vm.actor.skills['GCD'];
  }

  gcd() {
    let vm = this;
    if (!vm.actor.skills['GCD'] || !vm.triggerGcd) {
      return;
    }
    vm.actor.skills['GCD'].invoke();
  }

  constructor(actor) {
    super();
    let vm = this;

    vm.actor = actor;
    vm.resetCooldown();

    vm.defineEvent(
      'begin cast',
      'end cast',
      'begin recoil',
      'end recoil',
      'interupted',
      'updated',
      'begin cd',
      'end cd',
      'begin gcd',
      'end gcd'
    );

  }

  doHeal(target, percent = 0.5, cost = 20, resurect = false) {
    let vm = this;
    if (!target ||
      vm.actor.attributes.hp < 1 ||
      (!resurect && target.attributes.hp < 1)) {
      return;
    }

    if (vm.actor.spendMp(cost)) {
      let amt = Math.ceil(target.attributes.maxHp * percent);
      target.heal(amt);
      if (resurect && target.autoBattle && target.battle) {
        target.startAi();
      }
    }
  }

  doAttack(target, cost = 0) {
    let vm = this;

    if (!target || vm.actor.attributes.hp < 1) {
      return;
    }

    if (vm.actor.spendMp(cost)) {

      let maxDmg = vm.max;
      let minDmg = vm.min;
      let dmg = Math.ceil(Math.random() * maxDmg) + 1;
      if (dmg < minDmg) {
        dmg = minDmg + 1;
      } else if (dmg > maxDmg) {
        dmg = maxDmg;
      }

      //TODO use dex for crit and dodge
      //TODO add chance to miss

      target.takeDamage(dmg);
    }
  }

  invoke() {

  }

  resetCooldown() {
    let vm = this;
    vm.lastUsed = vm.now - vm.cooldown;
  }

  refresh() {}

  safeInvoke(action) {
    let vm = this;

    if (vm.onGcd ||
      vm.actor.casting === vm ||
      vm.actor.attributes.hp < 1) {
      return;
    }

    if (!vm.onCd && vm.actor.attributes.hp >= 1) {
      if (vm.actor.casting && !vm.isGcd) {
        vm.actor.casting.interupt();
      }

      if (vm.isGcd) {
        vm.raiseEvent(
          'begin gcd',
          vm
        );
      }

      if (vm.bubble) {
        vm.raiseEvent(
          'begin cast',
          vm
        );
      }

      if (!vm.isGcd) {
        vm.actor.casting = vm;
        vm.gcd();
      }

      vm.castId = setTimeout(() => {

        /* run the actual skill */
        action();

        vm.lastUsed = vm.now;

        if (vm.bubble) {
          vm.raiseEvent(
            'begin cd',
            vm
          );
          vm.cdId = setTimeout(() => {
            if (vm.bubble) {
              vm.raiseEvent(
                'end cd',
                vm
              );
            }
          }, vm.cooldown);
        }

        if (vm.bubble) {
          vm.raiseEvent(
            'end cast',
            vm
          );
        }

        vm.castId = -1;

        if (vm.bubble) {
          vm.raiseEvent(
            'begin recoil',
            vm
          );
        }

        vm.recoilId = setTimeout(() => {

          if (vm.bubble) {
            vm.raiseEvent(
              'end recoil',
              vm
            );
          }

          if (!vm.isGcd) {
            vm.actor.casting = undefined;
            vm.raiseEvent('updated');
          } else {
            vm.raiseEvent(
              'end gcd',
              vm
            );
          }

          vm.recoilId = -1;

        }, vm.recoilTime);
      }, vm.castTime);
    }

  }

  interupt() {
    let vm = this;
    clearTimeout(vm.castId);
    clearTimeout(vm.recoilId);
    vm.castId = -1;
    vm.casting = undefined;
    vm.recoilId = -1;
    vm.lock = false;
    vm.raiseEvent(
      'interupted',
      vm
    );
  }

}
```
## actors\enemies\emoji.js

**Path:** `battle\actors\enemies\emoji.js`

```
import { List } from '../../../core/list.js';
import { Actor } from '../actor.js';
import { ActorSkill } from '../actorSkill.js';
import { ActorLevel } from '../actorLevel.js';
import { ActorInventory } from '../actorInventory.js';
import { ActorAttributes } from '../actorAttributes.js';
import { Dice } from '../../dice.js';
import { Enemy } from './enemy.js';

export class Emoji extends Enemy {

  #stylesheet;
  #emoji;
  #names;

  constructor(gameLevel, battle) {
    super(gameLevel, battle);
    let vm = this;
    
    vm.name = 'emoji';

    vm.#emoji = new List();
    vm.#names = new List();

    vm.#emoji.push('🕷');
    vm.#names.push('Spider');

    vm.#emoji.push('🦇');
    vm.#names.push('Bat');

    vm.#emoji.push('🦂');
    vm.#names.push('Scorpion');

    vm.#emoji.push('💀');
    vm.#names.push('Skull');

    vm.#emoji.push('👹');
    vm.#names.push('Oni');

    vm.#emoji.push('👻');
    vm.#names.push('Ghost');

    vm.#emoji.push('👾');
    vm.#names.push('Octo');

    vm.#emoji.push('🐽');
    vm.#names.push('Slime');

    vm.#emoji.push('🦎');
    vm.#names.push('Lizard');

    vm.#emoji.push('🪬');
    vm.#names.push('Illumi');

    vm.#emoji.push('🪳');
    vm.#names.push('Roach');
    
    vm.#emoji.push('🐉');
    vm.#names.push('Wyrm');
    
    vm.#emoji.push('🐊');
    vm.#names.push('Gator');

    vm.#emoji.push('🐍');
    vm.#names.push('Snake');

    vm.#emoji.push('🐝');
    vm.#names.push('Bee');

    vm.#emoji.push('🦟');
    vm.#names.push('Hornet');

    vm.#emoji.push('🐌');
    vm.#names.push('Snail');

    vm.#emoji.push('☠️');
    vm.#names.push('Bones');

    vm.#emoji.push('❤️‍🔥');
    vm.#names.push('Desire');
    
    vm.#emoji.push('🧿');
    vm.#names.push('Beholder');
    
/*
    vm.#emoji.push('');
    vm.#names.push('');
*/

    vm.#ascii = vm.#emoji.sample();
    vm.displayName = vm.#names[vm.#emoji.indexOf(vm.#ascii)];
    vm.name = vm.displayName.toLowerCase();
  }

  #ascii;
  get ascii() {
    let vm = this;
    return vm.#ascii;
  }
}

```
## actors\enemies\enemy.js

**Path:** `battle\actors\enemies\enemy.js`

```
import { List } from '../../../core/list.js';
import { Actor } from '../actor.js';
import { ActorSkill } from '../actorSkill.js';
import { ActorLevel } from '../actorLevel.js';
import { ActorInventory } from '../actorInventory.js';
import { ActorAttributes } from '../actorAttributes.js';
import { Dice } from '../../dice.js';
import { Modal } from '../../../ui/modal/modal.js';

export class Enemy extends Actor {

  #weightedTargets;

  constructor(gameLevel, battle) {
    super(gameLevel);
    let vm = this;

    vm.battle = battle;
    vm.name = 'enemy';
    vm.displayName = 'enemy';
    
    vm.autoBattle = true;

    vm.attributes.pointsPerLevel = 10;

    vm.listenToEvent('death', (e) => {
      e.stopAi();
      if (e.casting) {
        e.casting.interupt();
      }
    });

    vm.listenToEvent('leveled up', (e) => {
      vm.attributes.baseHpLevel += 15;
      vm.attributes.vitalityLevel += 2;
      vm.recover();
    });

    vm.getId();
  }

  #getWeightedTargets() {
    let vm = this;
    let l = new List();

    let w = vm.enemies.find((e) => {
      return e.name == 'warrior';
    });

    let h = vm.enemies.find((e) => {
      return e.name == 'healer';
    });

    let m = vm.enemies.find((e) => {
      return e.name == 'mage';
    });

    while (l.length < 30) {
      l.push(w);
      l.push(w);
      l.push(w);
      l.push(h);
      l.push(w);
      l.push(w);
      l.push(w);
      l.push(m);
      l.push(w);
      l.push(w);
      l.push(w);
    }

    return l;
  }

  getTarget(hostile = true) {
    let vm = this;
    if (!vm.#weightedTargets || vm.#weightedTargets.length < 30) {
      vm.#weightedTargets = vm.#getWeightedTargets();
    }

    if (vm.target && hostile && vm.target.attributes.hp > 1 && vm.enemies.includes(vm.target)) {
      return vm.target;
    }

    let t = hostile ? vm.#weightedTargets.sample() : vm.party.random();
    while(t.attributes.hp < 1) {
      t = hostile ? vm.#weightedTargets.sample() : vm.party.random();
    }
    return t;
  }

  aiCanAct(d) {
    let vm = this;
    if (!d) {
      d = Dice.roll(20);
    }

    if (d > 18 ||
      vm.casting ||
      vm.battle.paused ||
      Modal.openCount > 1 ||
      vm.attributes.hp < 1) {
      return false;
    }

    return true;
  }

  aiLoop() {
    let vm = this;

    vm.checkLoop();
    
    let d = Dice.roll(20);

    if (vm.attributes.hp < 1) {
      vm.stopAi();
      return;
    }

    if (!vm.aiCanAct(d)) {
      return;
    }

    if (d > 3) {
      vm.skills.attack.invoke();
    }
  }

  spendPoints() {
    let vm = this;
    let stats = new List();
    stats.push('strength');
    stats.push('strength');
    stats.push('strength');
    stats.push('strength');
    stats.push('vitality');
    stats.push('strength');
    stats.push('strength');
    stats.push('vitality');
    stats.push('vitality');
    while (vm.attributes.available > 0) {
      vm.attributes.available--;
      vm.attributes[stats.sample()]++;
    }
  }

}

```
## actors\enemies\slime.js

**Path:** `battle\actors\enemies\slime.js`

```
import { List } from '../../../core/list.js';
import { Actor } from '../actor.js';
import { ActorSkill } from '../actorSkill.js';
import { ActorLevel } from '../actorLevel.js';
import { ActorInventory } from '../actorInventory.js';
import { ActorAttributes } from '../actorAttributes.js';
import { Dice } from '../../dice.js';
import { Enemy } from './enemy.js';

export class Slime extends Enemy {

  #stylesheet;
  #slimes;
  #names;

  constructor(gameLevel, battle) {
    super(gameLevel, battle);
    let vm = this;
    
    
    if (!document.getElementById('slimes-styles')) {
      vm.#stylesheet = document.createElement('link');
      vm.#stylesheet.id = 'slimes-styles';
      vm.#stylesheet.rel = 'stylesheet';
      vm.#stylesheet.href = './battle/actors/enemies/slimes.css';
      document.querySelector('head').appendChild(vm.#stylesheet);
    } else {
      vm.#stylesheet = document.querySelector('#slimes-styles');
    }


    vm.name = 'slime';

    vm.#slimes = new List();
    vm.#names = new List();

    vm.#slimes.push('( -  - )');
    vm.#names.push('Sizzy');

    vm.#slimes.push('( ●  ● )');
    vm.#names.push('Izzy');

    vm.#slimes.push('( ¤  ¤ )');
    vm.#names.push('Bizzy');

    vm.#slimes.push('( ○  ○ )');
    vm.#names.push('Vizzy');

    vm.#slimes.push('( □  □ )');
    vm.#names.push('Qizzy');

    vm.#slimes.push('( ◇  ◇ )');
    vm.#names.push('Lizzy');

    vm.#slimes.push('( ° ︎ ° )');
    vm.#names.push('Dizzy');

    vm.#slimes.push('( ■  ■ )');
    vm.#names.push('Wizzy');

    vm.#slimes.push('( ~  ~ )');
    vm.#names.push('Shizzy');

    vm.#slimes.push('( •  • )');
    vm.#names.push('Hizzy');

    vm.#slimes.push('( ▪  ▪︎ )');
    vm.#names.push('Fizzy');

    vm.#ascii = vm.#slimes.sample();
    vm.displayName = vm.#names[vm.#slimes.indexOf(vm.#ascii)];

  }

  #ascii;
  get ascii() {
    let vm = this;
    return vm.#ascii;
  }
}

```
## actors\enemies\slimes.css

**Path:** `battle\actors\enemies\slimes.css`

```
.Sizzy {
  color: orangered;
}

.Izzy {
  color: pink;
}

.Bizzy {
  color: chartreuse;
}

.Vizzy {
  color: paleturquoise;
}

.Qizzy {
  color: darkslategray;
}

.Lizzy {
  color: deeppink;
}

.Dizzy {
  color: darkolivegreen;
}

.Wizzy {
  color: darkblue;
}

.Shizzy {
  color: saddlebrown;
}

.Hizzy {
  color: burlywood;
}

.Fizzy {
  color: indianred;
}

```
## actors\heros\healer.js

**Path:** `battle\actors\heros\healer.js`

```
import { List } from '../../../core/list.js';
import { Actor } from '../actor.js';
import { ActorSkill } from '../actorSkill.js';
import { ActorLevel } from '../actorLevel.js';
import { ActorInventory } from '../actorInventory.js';
import { ActorAttributes } from '../actorAttributes.js';
import { Heal } from '../skills/heal.js';
import { GroupHeal } from '../skills/groupHeal.js';
import { Modal } from '../../../ui/modal/modal.js';
import { Smite } from '../skills/smite.js';
import { Resurect } from '../skills/resurect.js';

export class Healer extends Actor {

  #aiIntervalMin = 350;
  #aiIntervalMax = 650;

  constructor(gameLevel) {
    super(gameLevel);
    let vm = this;

    vm.reset();
    vm.name = 'healer';
    vm.displayName = 'Ayla';

    vm.attributes.scaleWith = 'intellect';

    vm.aiIntervalMin = vm.#aiIntervalMin;
    vm.aiIntervalMax = vm.#aiIntervalMax;

    delete vm.skills.attack;

    vm.addSkill('smite', new Smite(vm));
    vm.addSkill('heal', new Heal(vm));
    vm.addSkill('groupHeal', new GroupHeal(vm));
    vm.addSkill('resurect', new Resurect(vm));

    vm.listenToEvent('leveled up', (e) => {
      vm.attributes.baseHpLevel += 10;
      vm.attributes.baseMpLevel += 1;
      vm.attributes.intellectLevel++;
      vm.attributes.intellectLevel++;
      vm.attributes.intellectLevel++;
      vm.recover();

    });

  }

  reset() {
    let vm = this;

    vm.level.level = 1;
    vm.level.xp = 0;
    vm.level.xpToLevel = ActorLevel.xpForNextLevel();
    vm.attributes.scaleWith = 'intellect';

    vm.attributes.baseHp = 30;
    vm.attributes.baseMp = 30;

    vm.attributes.baseDamage = 7;
    vm.attributes.strength = 10;
    vm.attributes.vitality = 15;
    vm.attributes.intellect = 40;
    vm.attributes.pointsPerLevel = 5;

    vm.attributes.hp = vm.attributes.maxHp;
    vm.attributes.mp = vm.attributes.maxMp;
    
    vm.getId();
  }


  aiLoop() {
    let vm = this;

    vm.checkLoop();

    if (!vm.aiCanAct()) {
      return;
    }
    
    if (
      !vm.casting &&
      vm.skills.resurect &&
      vm.party.firstDead() &&
      vm.attributes.mp >= vm.skills.resurect.mpCost &&
      !vm.skills.resurect.onCd
    ) {
      vm.skills.resurect.invoke();
      return;
    }

    if (
      !vm.casting &&
      vm.party.lowHealth() &&
      vm.attributes.mp >= vm.skills.groupHeal.mpCost &&
      !vm.skills.groupHeal.onCd
    ) {
      vm.skills.groupHeal.invoke();
    } else if (
      !vm.casting &&
      vm.party.lowestHealthMember().lowHealth(0.7) &&
      vm.attributes.mp >= vm.skills.heal.mpCost &&
      !vm.skills.heal.onCd
    ) {
      vm.skills.heal.invoke();
      return;
    } else if (
      !vm.casting &&
      vm.skills.smite &&
      !vm.skills.smite.onCd
      ) {
      vm.skills.smite.invoke();
      return;
    }
  }

  spendPoints() {
    let vm = this;

    vm.buyAttribute('intellect');
    vm.buyAttribute('intellect');
    vm.buyAttribute('intellect');
    vm.buyAttribute('vitality');
    vm.buyAttribute('vitality');

  }

}

```
## actors\heros\mage.js

**Path:** `battle\actors\heros\mage.js`

```
import { List } from '../../../core/list.js';
import { Actor } from '../actor.js';
import { ActorSkill } from '../actorSkill.js';
import { ActorLevel } from '../actorLevel.js';
import { ActorInventory } from '../actorInventory.js';
import { ActorAttributes } from '../actorAttributes.js';
import { Modal } from '../../../ui/modal/modal.js';
import { ArcaneBlast } from '../skills/arcaneBlast.js';
import { ArcaneWave } from '../skills/arcaneWave.js';
import { MagicMissles } from '../skills/magicMissles.js';
import { Teleport } from '../skills/teleport.js';
import { Wand } from '../skills/wand.js';
import { Dice } from '../../dice.js';

export class Mage extends Actor {

  #aiIntervalMin = 350;
  #aiIntervalMax = 650;
  #regenMana = false;

  constructor(gameLevel) {
    super(gameLevel);
    let vm = this;

    vm.reset();
    vm.name = 'mage';
    vm.displayName = 'Zyth';

    vm.aiIntervalMin = vm.#aiIntervalMin;
    vm.aiIntervalMax = vm.#aiIntervalMax;

    vm.attributes.scaleWith = 'intellect';

    delete vm.skills.attack;

    vm.addSkill('wand', new Wand(vm));
    vm.addSkill('arcaneBlast', new ArcaneBlast(vm));
    vm.addSkill('magicMissles', new MagicMissles(vm));
    vm.addSkill('arcaneWave', new ArcaneWave(vm));
    vm.addSkill('teleport', new Teleport(vm));


    vm.listenToEvent('leveled up', (e) => {
      vm.attributes.baseHpLevel += 5;
      vm.attributes.baseMpLevel += 3;

      if (e.level.level % 10 == 0) {
        vm.attributes.baseDamageLevel += 3;
      }

      vm.attributes.intellectLevel++;
      vm.attributes.intellectLevel++;

      vm.recover();

    });

  }

  reset() {
    let vm = this;

    vm.level.level = 1;
    vm.level.xp = 0;
    vm.level.xpToLevel = ActorLevel.xpForNextLevel();

    vm.attributes.baseHp = 20;
    vm.attributes.baseMp = 50;
    vm.attributes.scaleWith = 'intellect';

    vm.attributes.baseDamage = 7;
    vm.attributes.strength = 10;
    vm.attributes.vitality = 15;
    vm.attributes.intellect = 80;
    vm.attributes.pointsPerLevel = 5;

    vm.attributes.hp = vm.attributes.maxHp;
    vm.attributes.mp = vm.attributes.maxMp;
    
    vm.getId();
  }

  aiLoop() {
    let vm = this;

    vm.checkLoop();

    if (!vm.aiCanAct()) {
      return;
    }
    
    if(vm.lowMana(0.05)) {
      vm.#regenMana = true;
    }
    
    if(vm.#regenMana && !vm.lowMana(0.7)) {
      vm.#regenMana = false;
    }

    if (
      !vm.casting &&
      vm.skills.arcaneWave &&
      vm.enemies.length > 2 &&
      !vm.skills.arcaneWave.onCd &&
      vm.attributes.mp >= vm.skills.arcaneWave.mpCost &&
      Dice.d6() > 2 &&
      !vm.#regenMana
    ) {
      vm.skills.arcaneWave.invoke();
      return;
    } else if (
      !vm.casting  &&
      vm.skills.magicMissles &&
      vm.enemies.length > 1 &&
      !vm.skills.magicMissles.onCd &&
      vm.attributes.mp >= vm.skills.magicMissles.mpCost &&
      Dice.d6() > 1 &&
      !vm.#regenMana
    ) {
      vm.skills.magicMissles.invoke();
      return;
    } else if (
      !vm.casting &&
      vm.skills.arcaneBlast &&
      !vm.skills.arcaneBlast.onCd &&
      vm.attributes.mp >= vm.skills.arcaneBlast.mpCost &&
      Dice.d6() > 2 &&
       !vm.#regenMana
    ) {
      vm.skills.arcaneBlast.invoke();
      return;
    } else if (
      !vm.casting &&
      vm.skills.wand &&
      !vm.skills.wand.onCd
    ) {
      vm.skills.wand.invoke();
      return;
    }
  }

  spendPoints() {
    let vm = this;

    vm.buyAttribute('intellect');
    vm.buyAttribute('intellect');
    vm.buyAttribute('intellect');
    vm.buyAttribute('intellect');
    vm.buyAttribute('vitality');

  }

}

```
## actors\heros\warrior.js

**Path:** `battle\actors\heros\warrior.js`

```
import { List } from '../../../core/list.js';
import { Actor } from '../actor.js';
import { ActorSkill } from '../actorSkill.js';
import { ActorLevel } from '../actorLevel.js';
import { ActorInventory } from '../actorInventory.js';
import { ActorAttributes } from '../actorAttributes.js';
import { Slam } from '../skills/slam.js';
import { Cleave } from '../skills/cleave.js';
import { Heal } from '../skills/heal.js';
import { Teleport } from '../skills/teleport.js';
import { AutoBattle } from '../skills/autoBattle.js';
import { Modal } from '../../../ui/modal/modal.js';
import { Dice } from '../../dice.js';
import { Slash } from '../skills/slash.js';

export class Warrior extends Actor {

  #aiIntervalMin = 350;
  #aiIntervalMax = 650;

  constructor(gameLevel) {
    super(gameLevel);
    let vm = this;

    vm.reset();

    vm.name = 'warrior';
    vm.displayName = 'Vor'

    vm.aiIntervalMin = vm.#aiIntervalMin;
    vm.aiIntervalMax = vm.#aiIntervalMax;
    
    delete vm.skills.attack;

    vm.addSkill('slash', new Slash(vm));
    vm.addSkill('cleave', new Cleave(vm));
    vm.addSkill('slam', new Slam(vm));

    vm.listenToEvent('leveled up', (e) => {
      vm.attributes.baseHpLevel += 20;
      if (e.level.level % 5 === 0) {
        vm.attributes.baseDamageLevel += 2;
      }

      if (e.level.level == 25) {
        vm.skills.cleave.addMaxCharge();
        vm.skills.slam.addMaxCharge();
      }

      vm.attributes.strengthLevel++;
      vm.attributes.strengthLevel++;
      vm.attributes.strengthLevel++;

      vm.recover();

    });

  }

  reset() {
    let vm = this;

    vm.autoBattle = true;

    vm.level.level = 1;
    vm.level.xp = 0;
    vm.level.xpToLevel = ActorLevel.xpForNextLevel();
    vm.attributes.scaleWith = 'strength';

    vm.attributes.baseHp = 50;

    vm.attributes.baseDamage = 8;
    vm.attributes.strength = 40;
    vm.attributes.vitality = 30;
    vm.attributes.intellect = 0;
    vm.attributes.pointsPerLevel = 5;

    vm.attributes.hp = vm.attributes.maxHp;
    vm.attributes.mp = vm.attributes.maxMp;

    vm.getId();
  }

  aiLoop() {
    let vm = this;

    vm.checkLoop();

    if (!vm.aiCanAct() || vm.casting) {
      return;
    }

    if (
      vm.enemies.length > 2 &&
      vm.skills.slam.charges > 0 &&
      !vm.skills.slam.onCd &&
      Dice.d6() > 2
    ) {
      vm.skills.slam.invoke();
      return;
    } else if (
      vm.enemies.length > 1 &&
      vm.skills.cleave.charges > 0 &&
      !vm.skills.cleave.onCd &&
      Dice.d6() > 1
    ) {
      vm.skills.cleave.invoke();
      return;
    } else if (!vm.skills.slash.onCd) {
      vm.skills.slash.invoke();
      return;
    }
  }

  spendPoints() {
    let vm = this;

    vm.buyAttribute('strength');
    vm.buyAttribute('strength');
    vm.buyAttribute('strength');
    vm.buyAttribute('vitality');
    vm.buyAttribute('vitality');

  }

}

```
## actors\items\either.js

**Path:** `battle\actors\items\either.js`

```
import { Item } from './item.js';

export class Either extends Item {
  
  constructor() {
    super();
    
  }
}

```
## actors\items\item.js

**Path:** `battle\actors\items\item.js`

```
import { List } from '../../../core/list.js';
import { EventHandler } from '../../../core/eventHandler.js'

export class Item extends EventHandler {

  stackable = false;
  equipable = false;
  

  constructor() {
    super();
    let vm = this;

  }
  
  get name() {
    return 'base item';
  }
  
  get displayName() {
    return 'Item';
  }
  
  get summary() {
    let vm = this;
    return `Base Item from which all items and equipment are derived.`;
  }
  
  equip() {}
  
  unequip() {}
  
  use(target) {
    
  }
  

}

```
## actors\items\lootTable.js

**Path:** `battle\actors\items\lootTable.js`

```

```
## actors\items\medicalHerb.js

**Path:** `battle\actors\items\medicalHerb.js`

```
import { Item } from './item.js';

export class MedicalHerb extends Item {
  
  constructor() {
    super();
    
  }
}

```
## actors\skills\arcaneBlast.js

**Path:** `battle\actors\skills\arcaneBlast.js`

```
import { List } from '../../../core/list.js';
import { ActorSkill } from '../actorSkill.js';

export class ArcaneBlast extends ActorSkill {

  constructor(actor) {
    super(actor);
    let vm = this;
    vm.cooldown = 2000;
    vm.register = true;
    vm.name = 'Arcane Blast';
    vm.bubble = true;
    vm.mpCost = 6;
    
    vm.calcDmg();
  }
  
  calcDmg() {
    let vm = this;
    let int = vm.actor.attributes.intellect;

    vm.minBy = Math.ceil(int * 0.15);
    vm.maxBy = Math.ceil(int * 0.35);
  }


  get displayName() {
    return `arcane blast`;
  }

  get summary() {
    let vm = this;
    vm.calcDmg();
    return `Blast target for ${vm.min}-${vm.max} damage.`;
  }

  invoke() {
    let vm = this;
    vm.actor.target = vm.actor.getTarget();
    vm.calcDmg();
    vm.safeInvoke(() => {
      vm.doAttack(vm.actor.target, vm.mpCost);
    });
  }

}

```
## actors\skills\arcaneWave.js

**Path:** `battle\actors\skills\arcaneWave.js`

```
import { List } from '../../../core/list.js';
import { ActorSkill } from '../actorSkill.js';


export class ArcaneWave extends ActorSkill {

  constructor(actor) {
    super(actor);
    let vm = this;
    vm.cooldown = 4000;
    vm.register = true;
    vm.name = 'Arcane Wave';
    vm.bubble = true;
    vm.mpCost = 15;
  }

  get displayName() {
    return `arcane wave`;
  }
  
  calcDmg() {
    let vm = this;
    let int = vm.actor.attributes.intellect + vm.actor.attributes.intellectLevel;

    vm.minBy = Math.ceil(int * 0.15);
    vm.maxBy = Math.ceil(int * 0.35);
  }
  

  get summary() {
    let vm = this;
    vm.calcDmg();
    return `Hit all enemies for ${vm.min}-${vm.max} damage.`;
  }

  invoke() {
    let vm = this;
    vm.safeInvoke(() => {
      vm.calcDmg();
      vm.actor.enemies.forEach((e) => {
        vm.doAttack(e, vm.mpCost);
      });
    });
  }

}

```
## actors\skills\attack.js

**Path:** `battle\actors\skills\attack.js`

```
import { List } from '../../../core/list.js';
import { ActorSkill } from '../actorSkill.js';

export class Attack extends ActorSkill {

  constructor(actor) {
    super(actor);
    let vm = this;
    vm.cooldown = 1000;
    vm.register = true;
    vm.name = 'Attack';
    vm.bubble = true;
    vm.mpCost = 0;
  }

  get displayName() {
    return `attack`;
  }

  get summary() {
    let vm = this;
    return `Hit target for ${vm.min}-${vm.max} damage.`;
  }

  invoke() {
    let vm = this;
    vm.actor.target = vm.actor.getTarget();
    vm.safeInvoke(() => {
      vm.doAttack(vm.actor.target);
    });
  }

}

```
## actors\skills\autoBattle.js

**Path:** `battle\actors\skills\autoBattle.js`

```
import { List } from '../../../core/list.js';
import { ActorSkill } from '../actorSkill.js';

export class AutoBattle extends ActorSkill {

  constructor(actor) {
    super(actor);
    let vm = this;
    vm.cooldown = 0;
    vm.register = true;
    vm.name = 'Auto-Battle';
    vm.bubble = true;
    vm.availableOutOfCombat = true;
    vm.availableOutOfCombatOnly = false;

    vm.mpCost = 0;
    vm.castTime = 0;
    vm.recoilTime = 0;
  }

  get displayName() {
    return `auto-battle`;
  }

  get summary() {
    let vm = this;
    let state = vm.actor.autoBattle ? 'ON' : 'OFF';
    return `Warrior will fight automatically. (${state})`;
  }

  invoke() {
    let vm = this;
    vm.safeInvoke(() => {
        vm.actor.autoBattle = !vm.actor.autoBattle;
    });
  }

}

```
## actors\skills\cleave.js

**Path:** `battle\actors\skills\cleave.js`

```
import { List } from '../../../core/list.js';
import { ActorSkill } from '../actorSkill.js';

export class Cleave extends ActorSkill {

  #maxCharges = 2;
  #charges = 2;
  #rechargeTime = 2500;

  constructor(actor) {
    super(actor);
    let vm = this;
    vm.cooldown = 500;
    vm.register = true;
    vm.name = 'Cleave';
    vm.#charges = vm.#maxCharges;
    vm.mpCost = 0;
    vm.calcDmg();
  }

  addMaxCharge() {
    let vm = this;
    vm.#maxCharges++;
    vm.#charges = vm.#maxCharges;
  }
  
  calcDmg() {
    let vm = this;
    vm.minBy = 0;
    vm.maxBy = 0
    
    vm.minBy = new Number('-' + Math.ceil(vm.min * 0.2));
    vm.maxBy = new Number('-' + Math.ceil(vm.max * 0.15));
  }
  
  get displayName() {
    let vm = this;
    return `cleave (${vm.charges})`;
  }

  get summary() {
    let vm = this;
    vm.calcDmg();
    return `Hit each enemy for ${vm.min}-${vm.max} damage.`;
  }

  get charges() {
    let vm = this;
    return vm.#charges;
  }

  invoke() {
    let vm = this;
    vm.calcDmg();
    vm.safeInvoke(() => {
      if (vm.#charges > 0) {
        vm.#charges--;
        let last = vm.actor.enemies.length - 1;
        for (let i = last; i > -1; i--) {
          vm.doAttack(vm.actor.enemies[i]);
        }
        setTimeout(() => {
          if (vm.#charges < vm.#maxCharges) {
            vm.#charges++;
            vm.raiseEvent('updated');
          }
        }, vm.#rechargeTime);
      }
    });
  }
}

```
## actors\skills\gcd.js

**Path:** `battle\actors\skills\gcd.js`

```
import { List } from '../../../core/list.js';
import { ActorSkill } from '../actorSkill.js';

export class GCD extends ActorSkill {

  constructor(actor) {
    super(actor);
    let vm = this;
    vm.cooldown = 250;
    vm.castTime = 25;
    vm.recoilTime = 25;
    vm.name = 'Global Cooldown';
    vm.triggerGcd = false;
    vm.bubble = false;
    vm.mpCost = 0;
  }

  get summary() {
    let vm = this;
    return 'The global cooldown for the actor, provides skills fire use gap.';
  }
  
  invoke() {
    let vm = this;
    vm.safeInvoke(() => { /* GCD DO NOTHING */ });
  }

}


```
## actors\skills\groupHeal.js

**Path:** `battle\actors\skills\groupHeal.js`

```
import { List } from '../../../core/list.js';
import { ActorSkill } from '../actorSkill.js';

export class GroupHeal extends ActorSkill {

  constructor(actor) {
    super(actor);
    let vm = this;
    vm.cooldown = 6000;
    vm.register = true;
    vm.name = 'Group Heal';
    vm.bubble = true;
    vm.availableOutOfCombat = true;
    vm.mpCost = 8;
  }
  
  get displayName() {
    return `group heal`;
  }
  
  get summary() {
    let vm = this;
    return `Heal party for 25% of max health (${Math.ceil(vm.actor.attributes.maxHp * 0.25)}).`;
  }

  invoke() {
    let vm = this;
    vm.safeInvoke(() => {
      vm.actor.party.each((actor) => {
        vm.doHeal(actor, 0.25, vm.mpCost);
      });
    });
  }

}

```
## actors\skills\heal.js

**Path:** `battle\actors\skills\heal.js`

```
import { List } from '../../../core/list.js';
import { ActorSkill } from '../actorSkill.js';

export class Heal extends ActorSkill {

  constructor(actor) {
    super(actor);
    let vm = this;
    vm.cooldown = 1500;
    vm.register = true;
    vm.name = 'Heal';
    vm.bubble = true;
    vm.availableOutOfCombat = true;
    vm.mpCost = 4;
  }
  
  get displayName() {
    return `heal`;
  }
  
  get summary() {
    let vm = this;
    return `Heal lowest health ally for 35% of max health.`;
  }

  invoke() {
    let vm = this;
    vm.safeInvoke(() => {
      vm.doHeal(vm.actor.party.lowestHealthMember(), 0.35, vm.mpCost);
    });
  }

}

```
## actors\skills\magicMissles.js

**Path:** `battle\actors\skills\magicMissles.js`

```
import { List } from '../../../core/list.js';
import { ActorSkill } from '../actorSkill.js';


export class MagicMissles extends ActorSkill {

  constructor(actor) {
    super(actor);
    let vm = this;
    vm.cooldown = 4000;
    vm.register = true;
    vm.name = 'Magic Missles';
    vm.bubble = true;
    vm.mpCost = 8;
  }

  get displayName() {
    return `magic missles`;
  }
  
  calcDmg() {
    let vm = this;
    vm.minBy = 0;
    vm.maxBy = 0
    
    vm.minBy = new Number('-' + Math.ceil(vm.min * 0.2));
    vm.maxBy = new Number('-' + Math.ceil(vm.max * 0.15));
  }
  

  get summary() {
    let vm = this;
    vm.calcDmg();
    return `Hit all enemies for ${vm.min}-${vm.max} damage.`;
  }

  invoke() {
    let vm = this;
    vm.safeInvoke(() => {
      vm.calcDmg();
      vm.actor.enemies.forEach((e) => {
        vm.doAttack(e, vm.mpCost);
      });
    });
  }

}

```
## actors\skills\resurect.js

**Path:** `battle\actors\skills\resurect.js`

```
import { List } from '../../../core/list.js';
import { ActorSkill } from '../actorSkill.js';

export class Resurect extends ActorSkill {

  constructor(actor) {
    super(actor);
    let vm = this;
    vm.cooldown = 2000;
    vm.register = true;
    vm.name = 'Resurect';
    vm.bubble = true;
    vm.availableOutOfCombat = true;
    vm.mpCost = 20;
  }
  
  get displayName() {
    return `resurect`;
  }
  
  get summary() {
    let vm = this;
    return `Resurect a fallen ally with 50% health.`;
  }

  invoke() {
    let vm = this;
    vm.safeInvoke(() => {
      vm.doHeal(vm.actor.party.firstDead(), 0.5, vm.mpCost, true);
    });
  }

}

```
## actors\skills\slam.js

**Path:** `battle\actors\skills\slam.js`

```
import { List } from '../../../core/list.js';
import { ActorSkill } from '../actorSkill.js';

export class Slam extends ActorSkill {

  #maxCharges = 1;
  #charges = 1;
  #rechargeTime = 3000;

  constructor(actor) {
    super(actor);
    let vm = this;
    vm.cooldown = 1000;
    vm.register = true;
    vm.name = 'Slam';
    vm.#charges = vm.#maxCharges;
    vm.mpCost = 0;
    vm.calcDmg();
  }

  addMaxCharge() {
    let vm = this;
    vm.#maxCharges++;
    vm.#charges = vm.#maxCharges;
  }

  calcDmg() {
    let vm = this;
    let str = vm.actor.attributes.strength;

    vm.minBy = Math.ceil(str * 0.15);
    vm.maxBy = Math.ceil(str * 0.35);
  }

  get displayName() {
    let vm = this;
    return `slam (${vm.charges})`;
  }

  get summary() {
    let vm = this;
    vm.calcDmg();

    return `Slam each enemy for ${vm.min}-${vm.max} damage.`;
  }

  get charges() {
    let vm = this;
    return vm.#charges;
  }

  invoke() {
    let vm = this;
    vm.safeInvoke(() => {
      vm.calcDmg();

      if (vm.#charges > 0) {
        vm.#charges--;
        let last = vm.actor.enemies.length - 1;
        for (let i = last; i > -1; i--) {
          vm.doAttack(vm.actor.enemies[i]);
        }
        setTimeout(() => {
          if (vm.#charges < vm.#maxCharges) {
            vm.#charges++;
            vm.raiseEvent('updated');
          }
        }, vm.#rechargeTime);
      }

    });
  }
}

```
## actors\skills\slash.js

**Path:** `battle\actors\skills\slash.js`

```
import { List } from '../../../core/list.js';
import { ActorSkill } from '../actorSkill.js';

export class Slash extends ActorSkill {

  constructor(actor) {
    super(actor);
    let vm = this;
    vm.cooldown = 750;
    vm.register = true;
    vm.name = 'Slash';
    vm.bubble = true;
    vm.mpCost = 0;
  }

  get displayName() {
    return `slash`;
  }

  get summary() {
    let vm = this;
    return `Hit target for ${vm.min}-${vm.max} damage.`;
  }

  invoke() {
    let vm = this;
    vm.actor.target = vm.actor.getTarget();
    vm.safeInvoke(() => {
      vm.doAttack(vm.actor.target);
    });
  }

}

```
## actors\skills\smite.js

**Path:** `battle\actors\skills\smite.js`

```
import { List } from '../../../core/list.js';
import { ActorSkill } from '../actorSkill.js';


export class Smite extends ActorSkill {

  constructor(actor) {
    super(actor);
    let vm = this;
    vm.cooldown = 1000;
    vm.register = true;
    vm.name = 'Smite';
    vm.bubble = true;
    vm.minBy = -2;
    vm.maxBy = -4;
    vm.mpCost = 0;
  }

  get displayName() {
    return `smite`;
  }

  get summary() {
    let vm = this;
    return `Hit target for ${vm.min}-${vm.max} damage.`;
  }

  invoke() {
    let vm = this;
    vm.actor.target = vm.actor.getTarget();
    vm.safeInvoke(() => {
      vm.doAttack(vm.actor.target);
    });
  }

}

```
## actors\skills\teleport.js

**Path:** `battle\actors\skills\teleport.js`

```
import { List } from '../../../core/list.js';
import { ActorSkill } from '../actorSkill.js';

export class Teleport extends ActorSkill {

  constructor(actor) {
    super(actor);
    let vm = this;
    vm.cooldown = 2000;
    vm.register = true;
    vm.name = 'Teleport';
    vm.bubble = true;
    vm.availableOutOfCombat = true;
    vm.availableOutOfCombatOnly = true;

    vm.mpCost = 20;
  }

  get displayName() {
    return `teleport`;
  }

  get summary() {
    let vm = this;
    return `Teleport to a random location in the maze.`;
  }

  invoke() {
    let vm = this;
    vm.safeInvoke(() => {
      if (vm.actor.spendMp(vm.mpCost)) {
        vm.actor.gameLevel.teleport();
      }
    });
  }

}

```
## actors\skills\wand.js

**Path:** `battle\actors\skills\wand.js`

```
import { List } from '../../../core/list.js';
import { ActorSkill } from '../actorSkill.js';


export class Wand extends ActorSkill {

  constructor(actor) {
    super(actor);
    let vm = this;
    vm.cooldown = 750;
    vm.register = true;
    vm.name = 'Wand';
    vm.bubble = true;
    vm.minBy = -2;
    vm.maxBy = -4;
    vm.mpCost = 0;
  }

  get displayName() {
    return `wand`;
  }

  get summary() {
    let vm = this;
    return `Hit target for ${vm.min}-${vm.max} damage. Generates 10 mana.`;
  }

  invoke() {
    let vm = this;
    vm.actor.target = vm.actor.getTarget();
    vm.safeInvoke(() => {
      vm.doAttack(vm.actor.target);
      if(vm.actor.attributes.mp < vm.actor.attributes.maxMp) {
        vm.actor.attributes.mp += 10;
        if(vm.actor.attributes.mp > vm.actor.attributes.maxMp) {
          vm.actor.attributes.mp = vm.actor.attributes.maxMp;
        }
      }
    });
  }

}

```
## actors\ui\actionbar.css

**Path:** `battle\actors\ui\actionbar.css`

```
.actionbar-btn {
  background-color: black;
  color: white;
  border: 1px solid white;
  border-radius: 13px 13px 13px 13px;
  margin-top: 2px;
  margin-right: 8px;
  margin-bottom: 4px;
  padding: 1px 3px 1px 3px;
  min-width: 98px;
}

.actionbar-btn-active-warrior {
  color: skyblue !important;
  border: 1px solid deepskyblue !important;
}

.actionbar-btn-active-healer {
  color: hotpink !important;
  border: 1px solid deeppink !important;
}

.actionbar-btn-active-mage {
  color: gold !important;
  border: 1px solid darkgoldenrod !important;
}

.actionbar-btn-cooldown {
  color: black !important;
  border: 1px dashed silver !important;
  background-color: white !important;
  opacity: 0.1;
}


.actionbar {
  border-bottom: 0px solid white;
  padding-bottom: 0px;
  margin-top: 0px;
  margin-bottom: 0px;
  height: 56px;
  padding-top: 12px;
}

```
## actors\ui\actionbar.js

**Path:** `battle\actors\ui\actionbar.js`

```
import { DOM } from '../../../core/dom.js';
import { List } from '../../../core/list.js';
import { EventHandler } from '../../../core/eventHandler.js'
import { Modal } from '../../../ui/modal/modal.js'

export class Actionbar extends EventHandler {

  #stylesheet;
  #actor;
  #battle;
  #bar;

  constructor(bar, actor, battle) {
    super();

    let vm = this;

    vm.#actor = actor;
    vm.#bar = bar;
    vm.#battle = battle;

    DOM.stylesheet('./battle/actors/ui/actionbar.css', 'actionbar_styles')

  }

  populate() {
    let vm = this;
    for (let k in vm.#actor.skills) {
      let skill = vm.#actor.skills[k];
      vm.#addButton(skill);
    }
  }

  #addButton(skill) {
    let vm = this;
    if (skill.register && !skill.availableOutOfCombatOnly) {
      let btn = DOM.button(skill.displayName, vm.#bar, 'actionbar-btn');
      vm.#buttonHooks(btn, skill);
    }
  }

  #buttonHooks(btn, skill) {
    let vm = this;

    let doClick = () => {
      if (!vm.#battle || vm.#battle.paused || Modal.openCount > 1) {
        return;
      }
      skill.invoke();
    };

    let begin = () => {
      btn.classList.add('actionbar-btn-active-' + skill.actor.name);
      btn.innerText = skill.displayName;
    };

    let done = () => {
      btn.classList.remove('actionbar-btn-active-' + skill.actor.name);
      btn.innerText = skill.displayName;
    };

    let beginCd = () => {
      btn.classList.add('actionbar-btn-cooldown');
      btn.innerText = skill.displayName;
    };

    let endCd = () => {
      btn.classList.remove('actionbar-btn-cooldown');
      btn.innerText = skill.displayName;
    };

    let update = () => {
      btn.innerText = skill.displayName;
      vm.#battle.partyInfo();
    };

    let release = () => {
      skill.ignoreEvent('updated', update);
      skill.ignoreEvent('end cast', update);
      skill.ignoreEvent('begin cd', beginCd);
      skill.ignoreEvent('end cd', endCd);
      skill.ignoreEvent('end recoil', done);
      skill.ignoreEvent('begin cast', begin);
      btn.removeEventListener('click', doClick);
      console.log('released skill ' + skill.name);
    }

    btn.addEventListener('click', doClick);
    skill.clearEvents();
    skill.listenToEvent('begin cast', begin);
    skill.listenToEvent('end recoil', done);
    skill.listenToEvent('begin cd', beginCd);
    skill.listenToEvent('end cd', endCd);
    skill.listenToEvent('updated', update);
    skill.listenToEvent('end cast', update);
  }


}
```
## actors\ui\characters.js

**Path:** `battle\actors\ui\characters.js`

```
import { List } from '../../../core/list.js';
import { Modal } from '../../../ui/modal/modal.js';
import { Nameplate } from './nameplate.js';

export class Characters {

  static characters; /* hax to be refactored */
  static #loopId = -1;
  static show(game) {
    let vm = Characters;


    if (!vm.characters) {
      vm.characters = new Modal();
      vm.characters.nav = document.createElement('span');
      vm.characters.nav.style.position = 'fixed';
      vm.characters.nav.style.bottom = '50px';
      vm.characters.nav.style.left = '1vw';
      vm.characters.nav.style.width = '98vw';
      vm.characters.nav.style.display = 'flex';
      vm.characters.nav.style.flexFlow = 'row';
      vm.characters.nav.style.justifyContent = 'space-evenly';
      vm.characters.nav.style.textAlign = 'start';
      vm.characters.nav.style.zIndex = '31000';

      vm.characters.warrior = new Nameplate(vm.characters.nav, game.warrior);
      vm.characters.healer = new Nameplate(vm.characters.nav, game.healer);
      vm.characters.mage = new Nameplate(vm.characters.nav, game.mage);

      vm.characters.warrior.box.style.width = '100px';
      vm.characters.healer.box.style.width = '100px';
      vm.characters.mage.box.style.width = '100px';

      vm.characters.warrior.box.style.padding = '3px 1px 6px 12px';
      vm.characters.warrior.box.style.borderRadius = '13px 13px 13px 13px';
      vm.characters.warrior.box.style.margin = '3px 3px 3px 3px';
      vm.characters.warrior.box.addEventListener('click', () => {
        vm.characters.warrior.box.style.border = '1px dashed white';
        vm.characters.healer.box.style.border = '1px dashed transparent';
        vm.characters.mage.box.style.border = '1px dashed transparent';
        game.healerDetail.close();
        game.mageDetail.close();
        game.warriorDetail.open();
      vm.characters.active = game.warriorDetail;
      });

      vm.characters.healer.box.style.padding = '3px 1px 6px 12px';
      vm.characters.healer.box.style.borderRadius = '13px 13px 13px 13px';
      vm.characters.healer.box.style.margin = '3px 3px 3px 3px';
      vm.characters.healer.box.addEventListener('click', () => {
        vm.characters.healer.box.style.border = '1px dashed white';
        vm.characters.warrior.box.style.border = '1px dashed transparent';
        vm.characters.mage.box.style.border = '1px dashed transparent';
        game.healerDetail.open();
        game.mageDetail.close();
        game.warriorDetail.close();
      vm.characters.active = game.healerDetail;
      });

      vm.characters.mage.box.style.padding = '3px 1px 6px 12px';
      vm.characters.mage.box.style.borderRadius = '13px 13px 13px 13px';
      vm.characters.mage.box.style.margin = '3px 3px 3px 3px';
      vm.characters.mage.box.addEventListener('click', () => {
        vm.characters.mage.box.style.border = '1px dashed white';
        vm.characters.warrior.box.style.border = '1px dashed transparent';
        vm.characters.healer.box.style.border = '1px dashed transparent';
        game.healerDetail.close();
        game.mageDetail.open();
        game.warriorDetail.close();
      vm.characters.active = game.mageDetail;
      });

      vm.characters.listenToEvent('closing', () => {
        game.healerDetail.close();
        game.mageDetail.close();
        game.warriorDetail.close();
        document.body.removeChild(vm.characters.nav);
        clearInterval(vm.#loopId);
        vm.#loopId = -1;
      });

       vm.characters.warrior.box.style.border = '1px dashed white';
     vm.characters.active = game.warriorDetail;
    }

    vm.characters.open(true);
    document.body.appendChild(vm.characters.nav);
    
    clearInterval(vm.#loopId);
    vm.#loopId = setInterval(() => {

        vm.characters.warrior.update();
        vm.characters.healer.update();
        vm.characters.mage.update();
        
        game.healerDetail.update();
        game.mageDetail.update();
        game.warriorDetail.update();

      },
      100
    );
    
    vm.characters.active.open();

  }
}

```
## actors\ui\detailSheet.css

**Path:** `battle\actors\ui\detailSheet.css`

```
.detail-sheet-content {
  position: fixed;
  top: 10px;
  left: 40px;
  right: 4vw;
  display: flex;
  justify-content: end;
  align-content: end;
  flex-flow: column;
  flex-wrap: nowrap;
  border: 1px solid white;
  margin-bottom: auto;
  padding: 10px 14px 10px 14px;
  font-size: 1.1em;
  line-height: 1.2em;
  border-radius: 13px 13px 13px 13px;
  background-color: black;
}

.detail-sheet-attribute-row {
  padding: 0 0 0 0;
  margin: 0 0 0 0;
  display: flex;
  justify-content: start;
  align-content: start;
  flex-flow: row;
  flex-wrap: nowrap;
}

.detail-sheet-attribute-group {
  width: 88%;
  min-width: 200px;
  display: flex;
  justify-content: start;
  align-content: end;
}

.detail-sheet-attribute-bold {
  font-size: 1.1em;
  line-height: 1.2em;
  font-weight: bold;
}

.detail-sheet-attribute-text {
  font-size: 1.1em;
  line-height: 1.2em;
  font-weight: normal;
}

.detail-sheet-attribute-text-tiny {
  font-size: 0.7em;
  line-height: 0.8em;
  font-weight: normal;
}

.detail-sheet-attribute-button {
  border: 1px solid white;
  width: 26px;
  height: 26px;
  padding: 0 0 0 0;
  background-color: black;
  border-radius: 13% 13% 13% 13%;
  color: white;
  margin: 2px 2px 2px 2px;
}

.detail-sheet-skills {
  display: flex;
  justify-content: end;
  align-content: end;
  flex-flow: row;
  flex-wrap: wrap;
  border: 1px solid white;
  margin-bottom: auto;
  padding: 10px 14px 10px 14px;
  font-size: 1.1em;
  line-height: 1.2em;
  border-radius: 13px 13px 13px 13px;
}

.detail-sheet-skill {
  font-size: 0.9em;
  padding: 3px 2px 4px 4px;
}

.detail-sheet-skill-edge {
  border-top: 0.5px dotted white;
}

.detail-sheet-skill-active {
  color: indigo;
}

```
## actors\ui\detailSheet.js

**Path:** `battle\actors\ui\detailSheet.js`

```
import { List } from '../../../core/list.js';
import { Modal } from '../../../ui/modal/modal.js'
import { SaveData } from '../../saveData.js';

export class DetailSheet extends Modal {

  #stylesheet;
  #actor;
  #editable = false;
  #container;
  #skills;
  #elements = new List();
  
  get container() {
    let vm = this;
    return vm.#container;
  }

  constructor(actor, editable = false) {
    super();
    let vm = this;

    vm.#actor = actor;
    vm.#editable = editable;

    if (!document.getElementById('detail-sheet-styles')) {
      vm.#stylesheet = document.createElement('link');
      vm.#stylesheet.id = 'detail-sheet-styles';
      vm.#stylesheet.rel = 'stylesheet';
      vm.#stylesheet.href = './battle/actors/ui/detailSheet.css';
      document.querySelector('head').appendChild(vm.#stylesheet);
    } else {
      vm.#stylesheet = document.querySelector('#detail-sheet-styles');
    }

    vm.#container = document.createElement('div');
    vm.#container.classList.add('detail-sheet-content');
    vm.appendChild(vm.#container);

    vm.#add('Name', vm.#actor, 'displayName');
    vm.#add('Class', vm.#actor, 'name');
    vm.#add('Level', vm.#actor.level, 'level');
    vm.#add('XP', vm.#actor.level, 'xpRequired');
    vm.#add('Gold', vm.#actor.inventory, 'gold');
    vm.#spacer();
    vm.#add('Health', vm.#actor.attributes, 'health');
    vm.#add('Mana', vm.#actor.attributes, 'mana');
    vm.#add('Damage', vm.#actor.attributes, 'damageRange');
    vm.#spacer();
    vm.#add('Available Points', vm.#actor.attributes, 'available');
    vm.#spacer();
    vm.#add('Vitality', vm.#actor.attributes, 'vitality', true && editable);
    vm.#add('Strength', vm.#actor.attributes, 'strength', true && editable);
    vm.#add('Intellect', vm.#actor.attributes, 'intellect', true && editable);
    vm.#spacer();

    let isHero = vm.#actor.gameLevel.isHero(vm.#actor);
    let txt = isHero ? 'Skills <span class="tiny-text">(☆ castable)</span>': 'Skills';
    vm.#text(txt);
    vm.#skills = document.createElement('div');
    vm.#skills.classList.add('detail-sheet-skills');
    vm.#container.appendChild(vm.#skills);
    let edge = '';
    for (let p in vm.#actor.skills) {
      let skill = vm.#actor.skills[p];
      if (skill.register) {
        vm.#addSkill(skill, isHero, edge);
        edge = 'detail-sheet-skill-edge';
      }
    }

    vm.listenToEvent('opening', (e) => {
      e.modal.update();
    });

    vm.listenToEvent('closed', (e) => {
      if(vm.#actor.gameLevel.isHero(vm.#actor)) {
        SaveData.save(vm.#actor.gameLevel);
      }
      vm.#actor.gameLevel.raiseEvent('updated', vm.#actor.gameLevel);
    });
  }

  #addSkill(skill, isHero, edge) {
    let vm = this;
    let e = {
      element: document.createElement('span'),
      update: () => {
        let castable = skill.availableOutOfCombat ? '☆ ' : '';
        let mp = skill.mpCost > 0 ? `, ${skill.mpCost}mp` : ``;
        e.element.innerHTML = `<span class="bold">${castable}${skill.name} (${skill.cooldown/1000}s cd${mp}): </span><span>${skill.summary}</span>`;
      }
    };

    if (isHero && skill.availableOutOfCombat && vm.#editable) {
      e.element.addEventListener('click', () => {
        e.element.classList.add('detail-sheet-skill-active');
        let clear = () => {
          e.element.classList.remove('detail-sheet-skill-active');
          vm.update();
          skill.ignoreEvent('end recoil', clear);
        };
        skill.listenToEvent('end recoil', clear);
        skill.invoke();
      });
    }

    e.update();
    e.element.classList.add('detail-sheet-skill');
    if(edge != '') {
      e.element.classList.add(edge);
    }
    vm.#elements.push(e);
    vm.#skills.appendChild(e.element);
  }

  #add(label, scope, key, editableAttribute = false) {
    let vm = this;
    let target = vm.#container;

    let e = {
      row: document.createElement('div'),
      infoGroup: document.createElement('span'),
      label: document.createElement('span'),
      value: document.createElement('span'),
      button: editableAttribute ? document.createElement('button') : undefined,
      update: () => {
        e.label.innerHTML = `${label}:&nbsp;`;
        if (scope[key + 'Level']) {
          e.value.innerHTML = `${scope[key] + scope[key + 'Level']}`;
        } else {
          e.value.innerHTML = `${scope[key]}`;
        }
      }
    };

    e.row.classList.add('detail-sheet-attribute-row');
    e.infoGroup.classList.add('detail-sheet-attribute-group');
    e.label.classList.add('detail-sheet-attribute-bold');
    e.value.classList.add('detail-sheet-attribute-text');

    e.infoGroup.appendChild(e.label);
    e.infoGroup.appendChild(e.value);
    e.row.appendChild(e.infoGroup);
    if (editableAttribute) {
      e.button.classList.add('detail-sheet-attribute-button');
      e.button.innerHTML = '+';
      e.row.appendChild(e.button);
      e.button.addEventListener('click', () => {
        if (vm.#actor.attributes.available > 0) {
          vm.#actor.attributes.available--;
          scope[key]++;
          vm.#actor.attributes.raiseEvent(
            'changed',
            {
              sheet: vm,
              actor: vm.#actor
            });
        }
        vm.update();
      });
    }

    vm.#elements.push(e);
    target.appendChild(e.row);

  }

  #spacer(target) {
    let vm = this;
    if (!target) {
      target = vm.#container;
    }

    let row = document.createElement('div');
    row.innerHTML = '&nbsp;';
    target.appendChild(row);
  }

  #text(t, target, bold = true) {
    let vm = this;
    if (!target) {
      target = vm.#container;
    }
    let txt = document.createElement('span');
    txt.innerHTML = t;
    txt.classList.add(bold ? 'detail-sheet-attribute-bold' : 'detail-sheet-attribute-text');
    target.appendChild(txt);
  }

  update() {
    let vm = this;
    for (let i = 0; i < vm.#elements.length; i++) {
      vm.#elements[i].update();
    }
  }
}

```
## actors\ui\gauge.css

**Path:** `battle\actors\ui\gauge.css`

```
.gauge-box {
  font-family: monospace;
  font-size: 0.8em;
  width: 100%;
  display: flex;
  flex-flow: row;
  flex-wrap: nowrap;
  justify-content: start;
  text-align: start;
  padding: 1px 1px 1px 1px;
}


.gauge-label {
  font-weight: bolder;
}

.gauge-outer {
  position: relative;
  width: 88%;
  height: 10px;
  line-height: 10px;
  font-size: 9px;
  padding: 0px 0px 0px 0px;
  overflow: hidden;
  border: 1px solid white;
  margin-top: auto;
  margin-bottom: auto;
  background-color: black;
  border-color: red;
  border-radius: 13px 13px 13px 13px;
}

.gauge-fill {
  position: absolute;
  top: 0px;
  left: 0px;
  display: flex;
  background-color: darkred;
  width: 100%;
  z-index: 1;
}

.gauge-text {
  position: absolute;
  top: 0px;
  left: 0px;
  display: flex;
  background-color: transparent;
  width: 100%;
  display: flex;
  flex-flow: row;
  justify-content: center;
  text-align: center;
  z-index: 2;
}
```
## actors\ui\gauge.js

**Path:** `battle\actors\ui\gauge.js`

```
import { List } from '../../../core/list.js';
import { EventHandler } from '../../../core/eventHandler.js'

export class Gauge extends EventHandler {

  #stylesheet;
  #max;

  #box;
  #outer;
  #fill;
  #barText;
  #label;

  constructor(
    container,
    max,
    val = -1,
    barText = '&nbsp;',
    labelText = '') {
    super();

    let vm = this;

    vm.#max = max;
    if (val == -1) {
      val = max;
    }

    if (!document.getElementById('gauge-styles')) {
      vm.#stylesheet = document.createElement('link');
      vm.#stylesheet.id = 'gauge-styles';
      vm.#stylesheet.rel = 'stylesheet';
      vm.#stylesheet.href = './battle/actors/ui/gauge.css';
      document.querySelector('head').appendChild(vm.#stylesheet);
    } else {
      vm.#stylesheet = document.querySelector('#gauge-styles');
    }

    vm.#box = document.createElement('span');
    vm.#label = document.createElement('span');
    vm.#outer = document.createElement('span');
    vm.#fill = document.createElement('span');
    vm.#barText = document.createElement('span');

    vm.#box.classList.add('gauge-box');
    vm.#label.classList.add('gauge-label');
    vm.#outer.classList.add('gauge-outer');
    vm.#fill.classList.add('gauge-fill');
    vm.#barText.classList.add('gauge-text');

    vm.#outer.appendChild(vm.#fill);
    vm.#outer.appendChild(vm.#barText);
    vm.#box.appendChild(vm.#label);
    vm.#box.appendChild(vm.#outer);

    vm.#fill.innerHTML = '&nbsp;';

    vm.update(val);
    vm.barText(barText);
    vm.labelText(labelText);

    container.appendChild(vm.#box);
  }
  
  hide() {
    let vm = this;
    vm.#box.style.display='none';
  }

  setMax(max, val) {
    let vm = this;
    vm.#max = max;
    if(val) {
      vm.update(val);
    }
  }

  update(val) {
    let vm = this;
    let p = vm.#percent(val);

    vm.#fill.style.width = p + '%';

    return p;
  }

  #percent(val) {
    let vm = this;
    return Math.floor(val / vm.#max * 100);
  }


  labelText(t) {
    let vm = this;
    if (t) {
      vm.#label.innerHTML = t;
    }
    return vm.#label.innerHTML;
  }

  barText(t) {
    let vm = this;
    if (t) {
      vm.#barText.innerHTML = t;
    }
    return vm.#barText.innerHTML;
  }

  width(v) {
    let vm = this;
    if (v) {
      vm.#box.style.width = v;
    }

    return vm.#box.style.width;
  }

  barWidth(v) {
    let vm = this;
    if (v) {
      vm.#outer.style.width = v;
    }

    return vm.#outer.style.width;
  }

  labelWidth(v) {
    let vm = this;
    if (v) {
      vm.#label.style.width = v;
    }

    return vm.#label.style.width;
  }

  height(v) {
    let vm = this;
    if (v) {
      vm.#box.style.height = v;
    }

    return vm.#box.style.height;
  }

  barHeight(v) {
    let vm = this;
    if (v) {
      vm.#outer.style.height = v;
    }

    return vm.#outer.style.height;
  }

  labelHeight(v) {
    let vm = this;
    if (v) {
      vm.#label.style.height = v;
    }

    return vm.#label.style.height;
  }


  textColor(v) {
    let vm = this;
    if (v) {
      vm.#barText.style.color = v;
    }

    return vm.#barText.style.color;
  }

  backgroundColor(v) {
    let vm = this;
    if (v) {
      vm.#box.style.backgroundColor = v;
    }

    return vm.#box.style.backgroundColor;
  }

  fillColor(v) {
    let vm = this;
    if (v) {
      vm.#fill.style.backgroundColor = v;
    }

    return vm.#fill.style.backgroundColor;
  }


  borderColor(v) {
    let vm = this;
    if (v) {
      vm.#outer.style.borderColor = v;
    }

    return vm.#outer.style.borderColor;
  }
}

```
## actors\ui\nameplate.css

**Path:** `battle\actors\ui\nameplate.css`

```
.nameplate {
  position: absolute;
  top: 6px;
  left: 6px;
  display: flex;
  flex-flow: column;
  flex-wrap: nowrap;
  justify-content: start;
  align-content: start;
  z-index: 3;
  margin-top: 4px;
  width: 100%;
}

.nameplate-text {
  font-size: 1.1em !important;
  font-weight: bolder !important;
}

.nameplate-outer {
  position: relative;
  width: 100%;
  min-height: 65px;
}

.nameplate-auto-battle-btn {
  position: absolute;
  z-index: 9;
  top: 6px;
  right: 10px;
  background-color: black;
  color: white;
  border: 1.5px solid white;
  border-radius: 100% 100% 100% 100%;
  padding: 0px 0.5em 0px 0.5em;
  font-weight: bolder;
  font-size: 1.3em;
}

```
## actors\ui\nameplate.js

**Path:** `battle\actors\ui\nameplate.js`

```
import { DOM } from '../../../core/dom.js';
import { List } from '../../../core/list.js';
import { EventHandler } from '../../../core/eventHandler.js'
import { Gauge } from './gauge.js';

export class Nameplate extends EventHandler {

  #stylesheet;

  #actor;

  #box;
  #plate;
  #autoBattleBtn;

  #name;
  #level;
  #health;
  #mana;

  get healthGauge() {
    let vm = this;
    return vm.#health;
  }

  get manaGauge() {
    let vm = this;
    return vm.#mana;
  }

  constructor(container, actor) {
    super();

    let vm = this;

    vm.#actor = actor;

    if (!document.getElementById('nameplaye-styles')) {
      vm.#stylesheet = document.createElement('link');
      vm.#stylesheet.id = 'nameplate-styles';
      vm.#stylesheet.rel = 'stylesheet';
      vm.#stylesheet.href = './battle/actors/ui/nameplate.css';
      document.querySelector('head').appendChild(vm.#stylesheet);
    } else {
      vm.#stylesheet = document.querySelector('#nameplate-styles');
    }

    vm.#box = document.createElement('div');
    vm.#plate = document.createElement('div');
    vm.#level = document.createElement('span');
    vm.#name = document.createElement('span');

    vm.#box.classList.add('nameplate-outer');
    vm.#plate.classList.add('nameplate');
    vm.#level.classList.add('nameplate-text');
    vm.#name.classList.add('nameplate-text');

    vm.#name.innerHTML = vm.#actor.displayName;
    vm.#level.innerHTML = 'level: ' + vm.#actor.level.level;
    vm.#name.style.padding = '2px 1px 2px 1px';
    vm.#level.style.padding = '2px 1px 2px 1px';

    vm.#plate.appendChild(vm.#name);
    vm.#plate.appendChild(vm.#level);

    vm.#health = new Gauge(
      vm.#plate,
      vm.#actor.attributes.maxHp,
      vm.#actor.attributes.hp,
      vm.#actor.attributes.health,
      '');

    vm.#mana = new Gauge(
      vm.#plate,
      vm.#actor.attributes.maxMp,
      vm.#actor.attributes.mp,
      vm.#actor.attributes.mana,
      '');
    vm.#mana.fillColor('darkblue');
    vm.#mana.borderColor('blue');

    vm.#box.appendChild(vm.#plate);
    container.appendChild(vm.#box);
  }

  get box() {
    let vm = this;
    return vm.#box;
  }

  get plate() {
    let vm = this;
    return vm.#plate;
  }

  hideLevel() {
    let vm = this;
    vm.#level.style.display = 'none';
  }

  hideName() {
    let vm = this;
    vm.#name.style.display = 'none';
  }

  hideMana() {
    let vm = this;
    vm.#mana.hide();
  }

  hideHealth() {
    let vm = this;
    vm.#health.hide();
  }

  #changed() {
    let vm = this;
    vm.#health.setMax(vm.#actor.attributes.maxHp, vm.#actor.attributes.hp);
    vm.#mana.setMax(vm.#actor.attributes.maxMp, vm.#actor.attributes.mp);
    vm.#health.barText(vm.#actor.attributes.health);
    vm.#mana.barText(vm.#actor.attributes.mana);
    vm.#name.innerHTML = vm.#actor.displayName;
    vm.#level.innerHTML = 'level: ' + vm.#actor.level.level;
  }

  update() {
    let vm = this;
    vm.#changed();
  }

  createAutoBattleButton() {
    let vm = this;

    if (vm.#autoBattleBtn) {
      return;
    }

    vm.#autoBattleBtn = DOM.button(
      '▸',
      vm.#box,
      ['nameplate-auto-battle-btn'],
      () => {
        if (vm.#actor.autoBattle) {
          vm.#autoBattleBtn.classList.remove('battle-green');
          vm.#actor.autoBattle = false;
          vm.#actor.stopAi();
        } else {
          vm.#autoBattleBtn.classList.add('battle-green');
          vm.#actor.autoBattle = true;
          vm.#actor.startAi();
        }
      }
    );

    if (vm.#actor.autoBattle) {
      vm.#autoBattleBtn.classList.add('battle-green');
    }
  }

}

```
## ui\battle.css

**Path:** `battle\ui\battle.css`

```
.battle-battlefield {
  position: fixed;
  top: 1vh;
  left: 2vw;
  right: 2vw;
  height: 63.5vh;
  border: 1px solid white;
  border-radius: 13px 13px 13px 13px;
  color: white;
  /*padding: 4px 1px 1px 6px;*/
  display: flex;
  flex-flow: row;
  flex-wrap: wrap;
  justify-content: center;
  align-content: center;
}

.battle-party-info {
  position: fixed;
  display: flex;
  flex-flow: column;
  flex-wrap: nowrap;
  justify-content: start;
  align-content: start;
  top: 65.5vh;
  left: 2vw;
  right: 60vw;
  height: 27vh;
  border: 1px solid white;
  border-radius: 13px 13px 13px 13px;
  color: white;
  /*
  padding: 6px 1px 1px 8px;
  */
  padding-left: 3px;
}

.battle-pc-actions {
  position: fixed;
  display: flex;
  justify-content: start;
  align-content: start;
  flex-flow: column;
  flex-wrap: nowrap;
  top: 65.5vh;
  left: 42vw;
  right: 2vw;
  height: 27vh;
  border: 1px solid white;
  border-radius: 13px 13px 13px 13px;
  color: white;

  padding: 0px 8px 0px 8px;

}

.battle-enemy {
  display: flex;
  flex-flow: column;
  justify-content: center;
  text-align: center;
  color: greenyellow;
  width: 165px;
  font-size: 2.5em;
  min-height: 43px;
  max-height: 45px;
  font-weight: bold;
  overflow: hidden;
  padding: 0px 0px 0px 0px;
  margin: 0px 0px 0px 0px;
}

.battle-enemy-attack {
  color: darkred !important;
  font-weight: bolder !important;
  font-size: 3.3em !important;
}

.battle-dmg {
  color: red;
  font-size: 1.8em;
  font-weight: bolder;
}

.battle-hide {
  display: none !important;
}

.battle-green {
  color: green !important;
  border-color: green !important;
}

.battle-top-btn {
  font-weight: bolder;
}

.battle-btn {
  background-color: black;
  color: white;
  border: 1px solid white;
  border-radius: 13px 13px 13px 13px;
  padding: 4px 6px 4px 6px;
  min-width: 90px;
}


.battle-pc-actionbar {
  display: flex;
  justify-content: start;
  align-content: start;
  flex-flow: row;
  flex-wrap: wrap;
  border: 1px solid white;
  border-radius: 13px 13px 13px 13px;
  color: white;
}

.battle-top-buttons {
  position: fixed;
  top: 14px;
  right: 2vw;
  width: 96vw;
  z-index: 200;
  display: flex;
  justify-content: space-evenly;
  flex-flow: row;
  flex-wrap: nowrap;
}

```
## ui\battle.js

**Path:** `battle\ui\battle.js`

```
import { DOM } from '../../core/dom.js';
import { List } from '../../core/list.js';
import { Modal } from '../../ui/modal/modal.js'
import { Dice } from '../dice.js';
import { Slime } from '../actors/enemies/slime.js';
import { ActorLevel } from '../actors/actorLevel.js';
import { ActorInventory } from '../actors/actorInventory.js';
import { DetailSheet } from '../actors/ui/detailSheet.js';
import { SaveData } from '../saveData.js';
import { Nameplate } from '../actors/ui/nameplate.js';
import { Spawner } from './spawner.js';
import { Actionbar } from '../actors/ui/actionbar.js'
import { Alert } from '../../ui/alert/alert.js';

export class Battle extends Modal {

  #stylesheet;
  #battlefield;
  #partyInfo;
  #actions;
  #topBtns;
  #pauseBtn;
  #autoBattleBtn;
  #fightWavesBtn;
  #autoPlayBtn;

  #gameLevel;
  #paused = true;

  #nameplates;
  #actionbars;

  #party;

  #partyDamaged;
  #partyDeath;
  #enemyDeath;
  #closing;
  #opening;

  #spawner;

  constructor(party, gameLevel) {
    super();
    let vm = this;

    vm.#party = party;
    vm.#gameLevel = gameLevel;
    vm.#paused = true;
    vm.#spawner = new Spawner(vm.#party, vm.#gameLevel, vm);

    DOM.stylesheet('./battle/ui/battle.css', 'battle_styles');

    vm.#battlefield = DOM.div(vm.content, 'battle-battlefield');
    vm.#partyInfo = DOM.div(vm.content, 'battle-party-info');
    vm.#actions = DOM.div(vm.content, 'battle-pc-actions');

    vm.#registerParty();
    vm.partyInfo();

    vm.#topBtns = DOM.nav(vm.content, 'battle-top-buttons');

    //vm.#createAutoBattleButton();
    vm.#createAutoPlayButton();
    vm.#createFightWavesButton();
    vm.#createPauseButton();

    vm.defineEvent(
      'begin combat',
      'end combat',
      'won battle'
    );

    vm.#opening = () => {
      vm.#spawner.spawn();
      setTimeout(() => {
          vm.#paused = false;
          vm.raiseEvent(
            'begin combat',
            {
              battle: vm,
              level: vm.#gameLevel
            });

          vm.startAi();
        },
        10
      );
    };

    vm.#closing = () => {
      vm.#party.each((a) => {
        a.ignoreEvent('damaged', vm.#partyDamaged);
        a.ignoreEvent('death', vm.#partyDeath);
        a.enemies.forEach((e) => {
          a.enemies.delete(e);
        });
        a.battle = undefined;
      });
      vm.ignoreEvent('opening', vm.#opening);
      vm.ignoreEvent('closing', vm.#closing);
    };

    vm.#enemyDeath = (e) => {
      e.ignoreEvent('death', vm.#enemyDeath);
      if (e.party.dead()) {
        vm.stopAi();
        vm.raiseEvent('end combat', vm);
        vm.raiseEvent('won battle', vm);
        e.battle = undefined;
      }
    };

    vm.listenToEvent('opening', vm.#opening);
    vm.listenToEvent('closing', vm.#closing);

  }

  get paused() {
    let vm = this;
    return vm.#paused;
  }

  get battlefield() {
    let vm = this;
    return vm.#battlefield;
  }

  get infoPanel() {
    let vm = this;
    return vm.#partyInfo;
  }

  get actionbars() {
    let vm = this;
    return vm.#actions;
  }

  #registerParty() {
    let vm = this;

    vm.#actionbars = new List();

    vm.#partyDamaged = () => {
      vm.partyInfo();
    };

    vm.#partyDeath = () => {
      if (vm.#party.dead()) {
        vm.stopAi();
        vm.raiseEvent('end combat', vm);
        vm.#gameLevel.gameOver();
        vm.close();
      }
    };

    vm.#party.each((a) => {
      if (!vm.#nameplates) {
        vm.#nameplates = new List();
      }
      let n = new Nameplate(vm.#partyInfo, a);
      n.createAutoBattleButton();
      let ii = -1;
      n.box.addEventListener('dblclick', () => {
        if (vm.#gameLevel.isWarrior(a)) {
          vm.#gameLevel.warriorInfo();
        } else if (vm.#gameLevel.isMage(a)) {
          vm.#gameLevel.mageInfo();
        } else if (vm.#gameLevel.isHealer(a)) {
          vm.#gameLevel.healerInfo();
        }
        vm.battlefield.classList.add('battle-hide');
        vm.infoPanel.classList.add('battle-hide');
        vm.actionbars.classList.add('battle-hide');
        clearInterval(ii);
        ii = setInterval(() => {
          if (Modal.openCount == 1) {
            vm.battlefield.classList.remove('battle-hide');
            vm.infoPanel.classList.remove('battle-hide');
            vm.actionbars.classList.remove('battle-hide');
            clearInterval(ii);
          }
        }, 10);
      });
      vm.#nameplates.push(n);
      a.listenToEvent('damaged', vm.#partyDamaged);
      a.listenToEvent('death', vm.#partyDeath);
      a.battle = vm;

      let ab = DOM.div(vm.#actions, 'actionbar');
      ab.bar = new Actionbar(ab, a, vm);
      ab.bar.populate();
      vm.#actionbars.push(ab);
    });

  }

  #createPauseButton() {
    let vm = this;
    vm.#pauseBtn = DOM.button(
      'pause',
      vm.#topBtns,
      ['battle-btn', 'battle-top-btn'],
      () => {
        if (vm.#paused) {
          vm.#paused = false;
          vm.#pauseBtn.classList.remove('battle-green');
        } else {
          vm.#pauseBtn.classList.add('battle-green');
          vm.#paused = true;
        }
      }
    );
  }

  #createAutoBattleButton() {
    let vm = this;
    vm.#autoBattleBtn = DOM.button(
      'auto battle',
      vm.#topBtns,
      ['battle-btn', 'battle-top-btn'],
      () => {
        if (vm.#party.first().autoBattle) {
          vm.#autoBattleBtn.classList.remove('battle-green');
          vm.#party.each((a) => {
            a.autoBattle = false;
            a.stopAi();
          });
        } else {
          vm.#autoBattleBtn.classList.add('battle-green');
          vm.#party.each((a) => {
            a.autoBattle = true;
            a.startAi();
          });
        }
      }
    );

    if (vm.#party.first().autoBattle) {
      vm.#autoBattleBtn.classList.add('battle-green');
    }
  }

  #createFightWavesButton() {
    let vm = this;
    vm.#fightWavesBtn = DOM.button(
      'waves',
      vm.#topBtns,
      ['battle-btn', 'battle-top-btn'],
      () => {
        if (vm.#gameLevel.fight.running && !vm.#gameLevel.fight.encounter) {
          vm.#gameLevel.fight.stop();
          vm.#fightWavesBtn.classList.remove('battle-green');
        } else {

          if (vm.#gameLevel.autoPilot.running) {
            vm.#gameLevel.autoPilot.stop();
            vm.#autoPlayBtn.classList.remove('battle-green');
          }

          vm.#gameLevel.fight.restart();
          vm.#fightWavesBtn.classList.add('battle-green');
        }
      }
    );

    if (vm.#gameLevel.fight.running && !vm.#gameLevel.fight.encounter) {
      vm.#fightWavesBtn.classList.add('battle-green');
    }

  }

  #createAutoPlayButton() {
    let vm = this;
    vm.#autoPlayBtn = DOM.button(
      'auto play',
      vm.#topBtns,
      ['battle-btn', 'battle-top-btn'],
      () => {
        if (vm.#gameLevel.autoPilot.running) {
          vm.#gameLevel.autoPilot.stop();
          vm.#autoPlayBtn.classList.remove('battle-green');
        } else {

          if (vm.#gameLevel.fight.running && !vm.#gameLevel.fight.encounter) {
            vm.#gameLevel.fight.stop();
            vm.#fightWavesBtn.classList.remove('battle-green');
          }

          vm.#gameLevel.autoPilot.start();
          vm.#autoPlayBtn.classList.add('battle-green');
        }
      }
    );

    if (vm.#gameLevel.autoPilot.running) {
      vm.#autoPlayBtn.classList.add('battle-green');
    }

  }

  partyInfo() {
    let vm = this;
    vm.#nameplates.forEach((n) => {
      n.update();
    });
  }

  addEnemey(e) {
    let vm = this;
    e.listenToEvent('death', vm.#enemyDeath);
    vm.#battlefield.appendChild(e.div);
  }

  removeEnemy(e) {
    let vm = this;
    e.stopAi();
    vm.#party.each((a) => {
      e.enemies.delete(a);
      a.enemies.delete(e);
    });
  }

  clearEnemies() {
    let vm = this;
    vm.#paused = true;
    let h = vm.#party.first();
    h.enemies.forEach((e) => {
      vm.removeEnemy(e);
    });
  }

  startAi() {
    let vm = this;
    vm.#paused = false;
    let h;
    vm.#party.each((a) => {
      if (a.autoBattle) {
        a.startAi();
      }
      h = a;
    });

    if (h) {
      h.enemies.forEach((e) => {
        e.startAi();
      });
    }
  }

  stopAi() {
    let vm = this;
    vm.#paused = true;
    let h;
    vm.#party.each((a) => {
      if (a.autoBattle) {
        a.stopAi();
      }
      h = a;
    });

    if (h) {
      h.enemies.forEach((e) => {
        e.stopAi();
      });
    }
  }

  pause() {
    let vm = this;
    vm.#paused = !vm.paused;
    if (vm.#paused) {
      vm.#pauseBtn.classList.add('battle-green');
    } else {
      vm.#pauseBtn.classList.remove('battle-green');
    }
  }

}

```
## ui\fight.js

**Path:** `battle\ui\fight.js`

```
import { List } from '../../core/list.js';
import { Modal } from '../../ui/modal/modal.js'
import { Dice } from '../dice.js';
import { SaveData } from '../saveData.js';
import { EventHandler } from '../../core/eventHandler.js';
import { Battle } from './battle.js';
import { Loader } from '../../ui/loader/loader.js';

export class Fight extends EventHandler {

  #party;
  #gameLevel;
  #battle;

  #running = false;

  #battleWon;
  #gameOver;
  #count = 1;

  #encounter = false;

  constructor(party, gameLevel) {
    super();
    let vm = this;

    vm.defineEvent('started', 'stopped');

    vm.#party = party;
    vm.#gameLevel = gameLevel;

    vm.#battleWon = () => {
      setTimeout(() => {
          if (vm.#battle) {
            vm.#battle.stopAi();
            vm.#battle.ignoreEvent('won battle', vm.#battleWon);
            vm.#battle.close();
            vm.#battle = undefined;
          }

          if (!vm.running) {
            return;
          }

          if (vm.#encounter) {
            vm.stop();
            return;
          }

          vm.#count++;

          if (vm.#count % 10 == 0) {
            vm.#party.each((a) => {
              a.recover();
            });
          }

          Loader.open('BATTLE ' + vm.#count);
          SaveData.save(vm.#gameLevel);
          vm.#beginBattle();
        },
        450
      );
    };

  }

  get running() {
    let vm = this;
    return vm.#running;
  }

  get encounter() {
    let vm = this;
    return vm.#encounter;
  }

  restart() {
    let vm = this;
    vm.#running = true;
    vm.#encounter = false;
    if(!vm.#battle) {
    vm.#running = true;
      vm.start(false);
    }
    vm.raiseEvent('started');
  }

  start(encounter = false) {
    let vm = this;
    if (vm.running) {
      return;
    }
    vm.#encounter = encounter;
    vm.#running = true;
    vm.#count = 1;
    vm.raiseEvent('started');
    if (encounter) {
      Loader.open('BATTLE');
    } else {
      Loader.open('BATTLE ' + vm.#count);
    }
    vm.#beginBattle();
  }

  stop() {
    let vm = this;
    if (!vm.running) {
      return;
    }
    vm.#encounter = false;
    vm.#running = false;
    vm.raiseEvent('stopped');
  }

  #beginBattle() {
    let vm = this;

    if (vm.#battle) {
      vm.#battle.stopAi();
      vm.#battle.ignoreEvent('won battle', vm.#battleWon);
      vm.#battle = undefined;
    }
    if (!vm.running) {
      return;
    }

    vm.#battle = new Battle(
      vm.#party,
      vm.#gameLevel);

    vm.#battle.listenToEvent('won battle', vm.#battleWon);

    setTimeout(() => {
        Loader.close(0);
        vm.#battle.open();
      },
      350
    );
  }

}

```
## ui\saves.css

**Path:** `battle\ui\saves.css`

```
.saves-controls {
  position: fixed;
  display: flex;
  flex-flow: row;
  justify-content: end;
  top: 9px;
  right: 9px;
}

.saves-controls button {
  background-color: black;
  color: white;
  border: 1px solid white;
  margin-right: 3px;
  border-radius: 13px 13px 13px 13px;
  min-width: 90px;
}

.saves-view {
  position: fixed;
  display: flex;
  flex-flow: row;
  flex-wrap: wrap;
  justify-content: end;
  text-align: center;
  top: 42px;
  right: 9px;
  max-width: 98vw;
  padding: 3px 3px 3px 3px;
  overflow-y: scroll;
}

.save-slot {
  margin-bottom: 4px;
  max-width: 200px;
  background-color: black;
  color: white;
  border: 1px solid white;
  padding: 8px 8px 8px 8px;
  border-radius: 13px 13px 13px 13px;
  margin-right: 6px;
}

.save-header {
  font-weight: bold;
  margin-bottom: 4px;
  display: flex;
  flex-flow: column;
  justify-content: start;
  text-align: start;
  flex-wrap: wrap;
}

.save-about {
  display: flex;
  flex-flow: column;
  justify-content: start;
  text-align: start;
  flex-wrap: nowrap;
  margin-bottom: 4px;
}

.save-buttons button {
  background-color: black;
  color: white;
  border: 1px solid white;
  margin-right: 3px;
  border-radius: 13px 13px 13px 13px;
  min-width: 60px;
}

.save-buttons {
  display: flex;
  flex-flow: row;
  flex-wrap: nowrap;
  justify-content: end;
}

```
## ui\saves.js

**Path:** `battle\ui\saves.js`

```
import { List } from '../../core/list.js';
import { Modal } from '../../ui/modal/modal.js'
import { SaveData } from '../saveData.js';

export class Saves extends Modal {

  #gameLevel;
  #stylesheet;
  #slotView;

  constructor(game) {
    super();

    let vm = this;

    vm.#gameLevel = game;

    if (!document.getElementById('saves-styles')) {
      vm.#stylesheet = document.createElement('link');
      vm.#stylesheet.id = 'saves-styles';
      vm.#stylesheet.rel = 'stylesheet';
      vm.#stylesheet.href = './battle/ui/saves.css';
      document.querySelector('head').appendChild(vm.#stylesheet);
    } else {
      vm.#stylesheet = document.querySelector('#saves-styles');
    }

    vm.#slotView = document.createElement('div');
    vm.#slotView.classList.add('saves-view');

    let row = document.createElement('div');
    let newSave = document.createElement('button');
    let newGame = document.createElement('button');

    row.classList.add('saves-controls');
    newSave.classList.add('saves-create');
    newGame.classList.add('saves-new-game');

    newSave.innerHTML = 'new save';
    newGame.innerHTML = 'new game';
    row.appendChild(newSave);
    row.appendChild(newGame);

    newSave.addEventListener('click', () => {
      let current = SaveData.getSlots();
      if (current && Array.isArray(current) && current.length > 5) {
        return;
      }
      let d = new Date();
      let s = `<span>${d.toLocaleDateString()}</span><span>${d.toLocaleTimeString()}</span>`;

      SaveData.save(vm.#gameLevel, s);
      vm.showSlot(s);
    });

    newGame.addEventListener('click', () => {
      vm.close();
      SaveData.remove('auto');
      vm.#gameLevel.begin(true);
    });

    vm.listenToEvent('opening', () => {
      let current = SaveData.getSlots();
      vm.#slotView.innerHTML = '';

      if (!current || !Array.isArray(current) || current.length < 1) {
        return;
      }

      for (let i = 0; i < current.length; i++) {
        vm.showSlot(current[i]);
      }
    });

    vm.appendChild(row);
    vm.appendChild(vm.#slotView);
  }


  showSlot(slot) {
    let vm = this;
    let data = SaveData.getState(slot);
    if (!data) {
      return;
    }

    let e = document.createElement('div');
    e.classList.add('save-slot');

    let h = document.createElement('div');
    h.classList.add('save-header');
    let t = (slot == 'auto') ? '<span>auto</span><span>save</span>' : slot;
    h.innerHTML = t.toUpperCase();
    e.appendChild(h);

    let about = document.createElement('div');
    about.classList.add('save-about');
    about.innerHTML = data.summary;
    e.appendChild(about);

    let buttons = document.createElement('div');
    buttons.classList.add('save-buttons');
    e.appendChild(buttons);

    let load = document.createElement('button');
    let del = document.createElement('button');
    load.classList.add('saves-load');
    del.classList.add('saves-del');

    load.innerHTML = 'load';
    del.innerHTML = 'delete';

    load.addEventListener('click', () => {
      vm.close();
      SaveData.load(vm.#gameLevel, slot);
    });

    del.addEventListener('click', () => {
      SaveData.remove(slot);
      vm.#slotView.removeChild(e);
    });

    buttons.appendChild(load);
    buttons.appendChild(del);

    vm.#slotView.appendChild(e);

  }
}

```
## ui\spawner.js

**Path:** `battle\ui\spawner.js`

```
import { List } from '../../core/list.js';
import { EventHandler } from '../../core/eventHandler.js';
import { Modal } from '../../ui/modal/modal.js'
import { Dice } from '../dice.js';
import { Emoji } from '../actors/enemies/emoji.js';
import { ActorLevel } from '../actors/actorLevel.js';
import { ActorInventory } from '../actors/actorInventory.js';
import { DetailSheet } from '../actors/ui/detailSheet.js';
import { SaveData } from '../saveData.js';
import { Nameplate } from '../actors/ui/nameplate.js';
import { Alert } from '../../ui/alert/alert.js';

export class Spawner extends EventHandler {

  #gameLevel;
  #battle;
  #party;

  #minMobLevel;
  #maxMobLevel;

  #combatDelayMin = 400;
  #combatDelayMax = 750;

  constructor(party, gameLevel, battle) {
    super();

    let vm = this;

    vm.#party = party;
    vm.#battle = battle;
    vm.#gameLevel = gameLevel;

  }

  get #combatDelay() {
    let vm = this;
    let r = Math.floor(Math.random() * vm.#combatDelayMax) + 1;
    if (r < vm.#combatDelayMin) {
      r = vm.#combatDelayMin;
    }

    return r;
  }


  spawn() {
    let vm = this;
    let count = vm.#spawnCount();

    vm.#party.each((a) => {
      a.enemies = new List();
    });

    for (let i = 0; i < count; i++) {
      vm.#addEnemey(i);
    }

    let delay = vm.#combatDelay;
    setTimeout(() => {
        vm.#gameLevel.raiseEvent(
          'begin combat',
          {
            battle: vm,
            level: vm.#gameLevel
          });

        vm.#battle.startAi();
      },
      delay
    );

  }

  #mobLevel() {
    let vm = this;

    vm.#minMobLevel = vm.#gameLevel.level - 2;
    vm.#maxMobLevel = vm.#gameLevel.level + 3;

    if (vm.#minMobLevel < 1) {
      vm.#minMobLevel = vm.#gameLevel.level;
    }

    if (Dice.d20() > 13) {
      let l = Math.floor(Math.random() * vm.#maxMobLevel) + 1;
      if (l < vm.#minMobLevel) {
        l = vm.#minMobLevel;
      }

      return l;
    }

    return vm.#gameLevel.level;
  }

  #spawnCount() {
    let vm = this;
    let d = Dice.roll(30);
    let m = 1;

    if (d > 27) {
      m = 10;
    } else if (d > 23) {
      m = 8;
    } else if (d > 17) {
      m = 6;
    } else if (d > 13) {
      m = 5;
    } else if (d > 11) {
      m = 4;
    } else if (d > 9) {
      m = 3;
    } else if (d > 7) {
      m = 2;
    }

    return Math.floor(Math.random() * m) + 1;
  }

  #addEnemey(index) {
    let vm = this;
    let e = vm.#createEnemyUI(index);

    vm.#createEnemy(e);
    vm.#enemyHooks(e);

    vm.#battle.addEnemey(e.enemy);
  }

  #createEnemyUI(index) {
    let vm = this;
    let e = {};

    e.div = document.createElement('div');
    e.plateDiv = document.createElement('div');
    e.enemyDiv = document.createElement('div');
    e.div.appendChild(e.enemyDiv);
    e.div.appendChild(e.plateDiv);

    e.plateDiv.style.paddingLeft = '6px';
    e.plateDiv.style.paddingRight = '6px';

    return e;
  }

  #createEnemy(e) {
    let vm = this;

    e.enemy = new Emoji(
      vm.#gameLevel,
      vm.#battle
    );

    e.enemyDiv.classList.add(e.enemy.displayName);

    let l = vm.#mobLevel();
    while (e.enemy.level.level < l) {
      e.enemy.level.levelUp();
    }

    e.enemy.spendPoints();
    e.enemy.recover();

    e.plate = new Nameplate(e.plateDiv, e.enemy);
    e.plate.healthGauge.barWidth('100%');
    e.plate.hideLevel();
    e.plate.hideMana();
    e.plate.update();
    e.plate.plate.style.top = '0px';
    e.plate.plate.style.left = '0px';
    e.plate.box.style.minHeight = '43px';

    e.enemy.div = e.div;
    e.details = new DetailSheet(e.enemy);

    vm.#party.each((a) => {
      a.enemies.forEach((v) => {
        v.party.add(e.enemy);
      });

      if (!a.enemies.includes(e.enemy)) {
        a.enemies.push(e.enemy);
      }

      if (!e.enemy.enemies.includes(a)) {
        e.enemy.enemies.push(a);
      }
    });

    e.enemyDiv.innerHTML = e.enemy.ascii;
    e.enemyDiv.classList.add('battle-enemy');
    e.plateDiv.classList.add('center');
  }

  #enemyHooks(e) {
    let vm = this;

    e.dblClick = () => {
      e.details.open(true);
    };

    e.beginCast = (n) => {
      e.enemyDiv.classList.add('battle-enemy-attack');
    };

    e.endRecoil = (n) => {
      e.enemyDiv.classList.remove('battle-enemy-attack');
    };

    e.damaged = (actor, dmg) => {
      e.enemyDiv.classList.add('battle-dmg');
      e.plate.update();
      setTimeout(() => {
        if (e && e.enemyDiv) {
          e.enemyDiv.classList.remove('battle-dmg');
        }
      }, 250);
    };

    e.death = (n) => {
      vm.#battle.removeEnemy(e.enemy);
      e.div.style.visibility = 'hidden';
      e.enemy.party.each((a) => {
        a.party.remove(e.enemy);
      });
      let xp = ActorLevel.monsterXp(e.enemy.level.level);
      //Alert.popup('Gained ' + xp + ' experience!', 650);
      vm.#party.each((a) => {
        a.enemies.delete(e.enemy);
        if (a.attributes.hp > 0) {
          a.level.addXp(xp);
          a.inventory.addGold(ActorInventory.monsterGold(e.enemy.level.level));
        }
      });
      e.enemy.stopAi();
    };

    e.detailsClosed = () => {
      vm.#battle.battlefield.classList.remove('battle-hide');
      vm.#battle.infoPanel.classList.remove('battle-hide');
      vm.#battle.actionbars.classList.remove('battle-hide');
    };

    e.detailsOpening = () => {
      vm.#battle.battlefield.classList.add('battle-hide');
      vm.#battle.infoPanel.classList.add('battle-hide');
      vm.#battle.actionbars.classList.add('battle-hide');
    };

    e.battleClosed = () => {
      let vm = this;
      e.div.removeEventListener('dblclick', e.dblClick);
      e.details.ignoreEvent('opening', e.detailsOpening);
      e.details.ignoreEvent('closed', e.detailsClosed);
      e.enemy.ignoreEvent('begin cast', e.beginCast);
      e.enemy.ignoreEvent('end recoil', e.endRecoil);
      e.enemy.ignoreEvent('damaged', e.damaged);
      e.enemy.ignoreEvent('death', e.death);
      e.enemy.stopAi();
      e.enemy.battle = undefined;
      e.plate = undefined;
      e.div = undefined;
      e.enemyDiv = undefined;
      e.plateDiv = undefined;
      e.details = undefined;
      e.enemy = undefined;
      e = undefined;
    };

    e.div.addEventListener('dblclick', e.dblClick);
    e.details.listenToEvent('opening', e.detailsOpening);
    e.details.listenToEvent('closed', e.detailsClosed);
    e.enemy.listenToEvent('begin cast', e.beginCast);
    e.enemy.listenToEvent('end recoil', e.endRecoil);
    e.enemy.listenToEvent('damaged', e.damaged);
    e.enemy.listenToEvent('death', e.death);

    vm.#battle.listenToEvent('closed', e.battleClosed);
  }

}

```
