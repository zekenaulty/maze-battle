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
