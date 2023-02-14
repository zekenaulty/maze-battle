import { List } from '../core/list.js';
import { EventHandler } from '../core/eventHandler.js'

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
import { Battle } from './ui/battle.js';
import { Dice } from './dice.js';
import { Loader } from '../layout/loader/loader.js';
import { SaveData } from './saveData.js';
import { AutoPilot } from './autoPilot.js';

export class GameLevel extends EventHandler {

  #level = 0;
  #mazeMaxRooms = 32;
  #toTiny = 14;
  #roomGrowthFactor = 0.3;

  #scaler;
  #renderer;
  #maze;
  #generators;

  #breath = 250;

  #warrior;
  #healer;

  #warriorDetail;
  #battle;
  #gameOverId = -1;

  #endGrind;

  autoPilot;

  get warrior() {
    let vm = this;
    return vm.#warrior;
  }

  get healer() {
    let vm = this;
    return vm.#healer;
  }
  
  get battle() {
    let vm = this;
    return vm.#battle;
  }

  saveState() {

    let vm = this;
    let warriorState = vm.#warrior.saveState();
    let healerState = vm.#healer.saveState();
    let mazeState = vm.#maze.saveState();
    let state = {
      level: vm.#level,
      mazeMaxRooms: vm.#mazeMaxRooms,
      toTiny: vm.#toTiny,
      roomGrowthFactor: vm.#roomGrowthFactor,
      warrior: warriorState,
      healer: healerState,
      maze: mazeState,
      summary: vm.summary
    };

    return state;
  }

  loadState(state) {
    let vm = this;

    if (vm.autoPilot) {
      vm.autoPilot.stop();
    }

    Loader.open();

    let warriorState = state.warrior;
    let healerState = state.healer;
    let mazeState = state.maze;

    vm.#level = state.level;
    vm.#mazeMaxRooms = state.mazeMaxRooms;
    vm.#toTiny = state.toTiny;
    vm.#roomGrowthFactor = state.roomGrowthFactor;

    vm.#resetMaze();

    vm.#warrior.reset();
    vm.#healer.reset();

    vm.#warrior.loadState(warriorState);
    vm.#healer.loadState(healerState);
    vm.#maze.loadState(mazeState);

    vm.#renderer.draw();

    Loader.close(350);
    vm.raiseEvent('updated', vm);
  }

  get level() {
    let vm = this;
    return vm.#level;
  }

  get summary() {
    let vm = this;
    return `
      <span><span class="bolder">Dungeon Level: </span>${vm.level}</span>
      <span><span class="bolder">Warrior</span></span>
      <span><span class="bolder pl-1">Level: </span>${vm.#warrior.level.level}</span>
      <span><span class="bolder pl-1">Health: </span>${vm.#warrior.attributes.health}</span>
      <span><span class="bolder pl-1">Mana: </span>${vm.#warrior.attributes.mana}</span>
    `;
    //      <span><span></span>${}</span>

  }

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
      'grind started',
      'grind stopped'
    );

    vm.#warrior = new Warrior(vm);
    vm.#healer = new Healer(vm);
    vm.#warrior.party.add(vm.#healer);
    vm.#healer.party.add(vm.#warrior);
    
    vm.#warriorDetail = new DetailSheet(vm.#warrior, true);
    vm.autoPilot = new AutoPilot(vm.#warrior.party);

  }

  isWarrior(actor) {
    let vm = this;
    return actor === vm.#warrior;
  }
  
  isHealer(actor) {
    let vm = this;
    return actor === vm.#healer;
  }
  
  isHero(actor) {
    let vm = this;
    return vm.isWarrior(actor) || vm.isHealer(actor);
  }
  
  initialize(width, height, gfx) {
    let vm = this;
    vm.#scaler = new CanvasRectangleScaler(width, height);
    vm.#maze = new Maze(vm.#scaler.rows, vm.#scaler.columns);
    vm.#renderer = new CanvasRectangle(vm, vm.#maze, vm.#scaler, gfx);
    vm.#loadGenerators();
    vm.#maze.listenToEvent('solved', () => {
      vm.#nextLevel();
    });
  }

  begin(newGame = false) {
    let vm = this;
    let saved = SaveData.getState();

    if (saved && !newGame) {
      vm.loadState(saved);
    } else {
      vm.#firstLevel();
    }
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

  #randomMaze() {
    let vm = this;
    Loader.open();
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

    vm.raiseEvent('updated', vm);

    if (vm.autoPilot) {
      vm.autoPilot.stop();
    }

  }

  #nextLevel() {
    let vm = this;

    vm.#level++;
    vm.#mazeMaxRooms += Math.ceil(vm.#mazeMaxRooms * vm.#roomGrowthFactor);
    vm.#resetMaze();
    vm.#randomMaze();
    vm.#warrior.recover();
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
    vm.#generators.push(new AldousBroder(vm.#maze));
    vm.#generators.push(new Wilsons(vm.#maze));
    vm.#generators.push(new HuntAndKill(vm.#maze));
    */
    vm.#generators.push(new RecursiveBacktracker(vm.#maze));
    /*
    vm.#generators.push(new SimplePrims(vm.#maze));
    vm.#generators.push(new GrowingTree(vm.#maze));
    */

    vm.#generators.forEach((g) => {
      g.listenToEvent('generated', () => {
        setTimeout(() => {
          Loader.open();
          vm.#renderer.draw();
          Loader.close(350);
          vm.raiseEvent('updated', vm);
        }, vm.#breath);
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

      let dice = Dice.many(20, 20, 20, 20);
      if (vm.#shouldBattle(dice)) {
        Loader.open('BATTLE');
        setTimeout(() => {
          vm.beginBattle();
        }, 650);
      } else if (vm.#shouldTeleport(dice)) {
        vm.teleport();
      }

      vm.raiseEvent('updated', vm);
    }, 100);

  }

  beginBattle(action) {
    let vm = this;
    vm.raiseEvent('battle starting', vm);

    vm.#battle = new Battle(
      vm.#warrior.party,
      vm);

    vm.#battle.listenToEvent('won battle', () => {
      vm.raiseEvent('won battle');
      if (action) {
        action();
      }
    });

    Loader.close(0);
    vm.#battle.open();

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
    return d[0] > 11 && d[1] < 11 && d[2] > 2 && d[3] < 20;
  }

  #shouldTeleport(d) {
    return d[0] > 18 && d[1] > 10 && d[2] > 10 && d[3] > 10;
  }

  gameOver(delay = 2250) {
    let vm = this;
    if (vm.#gameOverId > -1 || !vm.#battle) {
      return;
    }

    vm.stopGrind();
    vm.autoPilot.stop();

    //alert('GAME OVER');
    vm.#gameOverId = setTimeout(() => {
      if (vm.#battle) {
        vm.#warrior.stopAi();
        vm.#battle.clearEnemies();
        vm.#battle.close();
        vm.#battle = undefined;
        vm.#gameOverId = -1;
        vm.raiseEvent('game over', vm);

        vm.#firstLevel();
      }
    }, delay);
  }

  histogram() {
    let vm = this;
    vm.#renderer.histogram();
  }

  #grind = false;
  #grindCount = 0;
  #grindCap = 0;
  #battleLoop(vm) {
    if (!vm.#grind) {
      return;
    }

    if (vm.#grindCap > 0 && vm.#grindCount >= vm.#grindCap) {
      vm.stopGrind();
      return;
    }

    vm.#grindCount++;

    if (vm.#grindCount % 10 == 0) {
      vm.#warrior.recover();
    }

    Loader.open('BATTLE ' + vm.#grindCount);
    setTimeout(() => {
      if (!vm.#grind) {
        return;
      }

      if (!vm.#warrior.lowHealth(0.25)) {
        vm.beginBattle(() => {
          vm.#battleLoop(vm);
        });
      } else {
        vm.stopGrind();
      }
    }, 650);
  }

  get grinding() {
    let vm = this;
    return vm.#grind;
  }

  stopGrind() {
    let vm = this;
    if (vm.#grind) {
      vm.#grind = false;
      vm.#warrior.recover();
      vm.#grindCount = 0;
      vm.raiseEvent('grind stopped');
    }
  }

  startGrind(cap = 0) {
    let vm = this;
    if (!vm.#grind) {
      vm.#grindCap = cap;
      vm.#grind = true;
      vm.#grindCount = 0;
      vm.raiseEvent('grind started');
      vm.#battleLoop(vm);
    }
  }

  grind(cap = 0) {
    let vm = this;
    if (vm.#grind) {
      vm.stopGrind();
    } else {
      vm.startGrind(cap);
    }
  }
}
