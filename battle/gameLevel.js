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
import { Hero } from './actors/hero/hero.js';
import { Battle } from './ui/battle.js';
import { Dice } from './dice.js';

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

  #hero = new Hero();
  #heroDetail;
  #battle;

  constructor() {
    super();

    this.defineEvent(
      'game over',
      'won battle',
      'completed level',
      'saved',
      'loaded save',
      'moved');

  }

  initialize(width, height, gfx) {
    this.#scaler = new CanvasRectangleScaler(width, height);
    this.#maze = new Maze(this.#scaler.rows, this.#scaler.columns);
    this.#renderer = new CanvasRectangle(this.#maze, this.#scaler, gfx);
    this.#loadGenerators();
    this.#maze.listenToEvent('solved', () => {
      this.#nextLevel();
    });
  }

  begin(newGame = false) {
    let saveData = localStorage.getItem('DC_GAME_SAVE');

    if (saveData && !newGame) {

    } else {
      this.#firstLevel();
    }
  }

  solve() {
    if (!this.#renderer.showSolution) {
      this.#renderer.revealSolution();
    } else {
      this.#renderer.hideSolution();
    }
  }
  
  heroInfo() {
    this.#heroDetail.open(true);
  }

  #randomMaze() {
    setTimeout(() => {
      this.#randomGenerator().generate();
    }, this.#breath);
  }

  #firstLevel() {
    this.#level = 1;
    this.#mazeMaxRooms = 32;
    this.#resetMaze();
    this.#randomMaze();
    this.#hero = new Hero();
    this.#heroDetail = new DetailSheet(this.#hero, true);
  }

  #nextLevel() {
    this.#level++;
    this.#mazeMaxRooms += Math.ceil(this.#mazeMaxRooms * this.#roomGrowthFactor);
    this.#resetMaze();
    this.#randomMaze();
  }

  #resetMaze() {

    this.#scaler.setScaleBounds(this.#mazeMaxRooms, this.#toTiny);
    this.#scaler.calc();
    this.#maze.resize(this.#scaler.rows, this.#scaler.columns);

  }

  #randomGenerator() {
    return this.#generators.sample();
  }

  #loadGenerators() {
    this.#generators = new List();
    /* 
    this.#generators.push(new BinaryTree(this.#maze));
    this.#generators.push(new Sidewinder(this.#maze));
    this.#generators.push(new AldousBroder(this.#maze));
    this.#generators.push(new Wilsons(this.#maze));
    this.#generators.push(new HuntAndKill(this.#maze));
    */
    this.#generators.push(new RecursiveBacktracker(this.#maze));
    /*
    this.#generators.push(new SimplePrims(this.#maze));
    this.#generators.push(new GrowingTree(this.#maze));
    */

    this.#generators.forEach((g) => {
      g.listenToEvent('generated', () => {
        setTimeout(() => {
          this.#renderer.draw();
        }, this.#breath);
      });
    });
  }

  move(d) {
    if (this.#maze.move(d)) {
      this.raiseEvent('moved');
    }
    
    let dice = Dice.many(20, 20, 20, 20);
    if(this.#shouldBattle(dice)) {
      this.raiseEvent('battle starting');
      this.#battle = new Battle(this.#hero);
      this.#battle.open(true);
      
    } else if(this.#shouldTeleport(dice)) {
      this.raiseEvent('teleporring');
      
    }
  }
  
  #shouldBattle(d) {
    return d[0] > 11 && d[1] < 11 && d[2] > 2 && d[3] < 20;
  }
  
  #shouldTeleport(d) {
    return d[0] > 18 && d[1] > 10 && d[2] > 10 && d[3] > 10;
  }


}
