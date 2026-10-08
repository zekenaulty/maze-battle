# Directory Snapshot

```
- mazes/
  - distance.js
  - maze.js
  - cell/
    - cell.js
    - links.js
    - neighbors.js
    - squareCell.js
  - generators/
    - aldousBroder.js
    - binaryTree.js
    - generator.js
    - growingTree.js
    - huntAndKill.js
    - prims.js
    - recursiveBacktracker.js
    - sidewinder.js
    - wilsons.js
  - renderers/
    - canvasRectangle.js
    - canvasRectangleScaler.js
    - common.js
    - mazeToText.js
```
## distance.js

**Path:** `mazes\distance.js`

```

import { List } from '../core/list.js';

export class Distance {
  root;
  distances = {};
  items = new List();

  constructor(start) {
    let vm = this;

    vm.root = start;
    vm.distances[vm.root.key] = 0;
    vm.items.push(vm.root)

  }

  collect(cell, distance) {
    let vm = this;
    vm.distances[cell.key] = distance;
    vm.items.push(cell);
  }

  distance(cell) {
    let vm = this;
    return vm.distances[cell.key];
  }

  pathTo(cell) {
    let vm = this;
    let current = cell;
    let breadcrumbs = new Distance(vm.root);
    while (current !== vm.root) {
      for (let i = 0; i < current.links.items.length; i++) {
        let neighbor = current.links.items[i];
        if (vm.distance(neighbor) < vm.distance(current)) {
          breadcrumbs.collect(neighbor, vm.distance(neighbor));
          current = neighbor;
          break;
        }
      }
    }
    return breadcrumbs;
  }

  max() {
    let vm = this;
    let maxDistance = 0;
    let maxCell = vm.root;
    for (let i = 0; i < vm.items.length; i++) {
      let c = vm.items[i];
      let d = vm.distance(c);
      if (d > maxDistance) {
        maxCell = c;
        maxDistance = d;
      }
    }

    return {
      cell: maxCell,
      distance: maxDistance
    };
  }
}

```
## maze.js

**Path:** `mazes\maze.js`

```
import { List } from '../core/list.js';
import { SquareCell } from './cell/squareCell.js';
import { EventHandler } from '../core/eventHandler.js'

export class Maze extends EventHandler {

  grid = new List();
  cells = new List();
  visited = new List();

  rows = 0;
  columns = 0;
  start;
  end;
  active;
  distances;
  solution;
  
  saveState() {
    let vm = this;
    let r = {
      rows: vm.rows,
      columns: vm.columns,
      start: vm.start.gridPosition,
      end: vm.end.gridPosition,
      active: vm.active.gridPosition,
      cells: new List(),
      visited: new List()
    };
    
    vm.eachCell((c) => {
      r.cells.push(c.saveState());
    });
    
    vm.visited.forEach((c) => {
      r.visited.push(c.gridPosition);
    });
    
    return r;
  }
  
  loadState(state) {
    let vm = this;
    vm.resize(state.rows, state.columns);
    vm.initialize();
    
    state.cells.forEach((c) => {
      vm.cell(c.row, c.column).loadState(vm, c);
    });
    
    state.visited.forEach((c) => {
      vm.visited.push(vm.cell(c.row, c.column));
    });
    
    vm.start = vm.cell(state.start.row, state.start.column);
    vm.end = vm.cell(state.end.row, state.end.column);
    vm.active = vm.cell(state.active.row, state.active.column);
    vm.distances = vm.start.distances();
    vm.solve();
  }

  constructor(rows, columns) {
    super();
    let vm = this;
    vm.defineEvent('moved', 'solved');
    vm.resize(rows, columns);
  }

  resize(rows, columns) {
    let vm = this;
    vm.rows = rows;
    vm.columns = columns;
  }

  initialize() {
    let vm = this;

    vm.grid = new List();
    vm.cells = new List();
    vm.visited = new List();

    vm.start = undefined;
    vm.end = undefined;
    vm.active = undefined;
    vm.distances = undefined;
    vm.solution = undefined;

    let cells = vm.populate();
    vm.grid = cells.grid;
    vm.cells = cells.all;

    vm.configureCells();
  }

  populate() {
    let vm = this;
    let all = new List();
    let grid = new List();

    vm.walkGrid((r, c) => {
      if (grid.length - 1 < r) {
        grid.push(new List());
      }
      let n = new SquareCell(r, c);
      grid[r].push(n);
      all.push(n);
    });

    return {
      grid: grid,
      all: all
    };
  }

  configureCells() {
    let vm = this;
    vm.eachCell((cell) => {
      cell.north = vm.cell(cell.row - 1, cell.column);
      cell.east = vm.cell(cell.row, cell.column + 1);
      cell.south = vm.cell(cell.row + 1, cell.column);
      cell.west = vm.cell(cell.row, cell.column - 1);

      if (cell.north) { cell.neighbors.items.push(cell.north); }
      if (cell.east) { cell.neighbors.items.push(cell.east); }
      if (cell.south) { cell.neighbors.items.push(cell.south); }
      if (cell.west) { cell.neighbors.items.push(cell.west); }
    });
  }

  cell(row, column) {
    let vm = this;
    if (row < 0 || column < 0 || row >= vm.rows || column >= vm.columns) {
      return undefined;
    }

    return vm.grid[row][column];
  }

  eachRow(action) {
    let vm = this;
    for (let r = 0; r < vm.rows; r++) {
      action(vm.grid[r]);
    }
  }

  eachCell(action) {
    let vm = this;
    for (let i = 0; i < vm.cells.length; i++) {
      action(vm.cells[i]);
    }
  }

  walkGrid(action) {
    let vm = this;
    for (let r = 0; r < vm.rows; r++) {
      for (let c = 0; c < vm.columns; c++) {
        action(r, c);
      }
    }
  }

  randomCell() {
    let vm = this;
    return vm.grid.sample().sample();
  }

  get size() {
    let vm = this;
    return vm.rows * vm.columns;
  }

  setup() {
    let vm = this;
    vm.braid();
    vm.start = vm.deadends.sample();
    if (!vm.start) {
      vm.start = vm.cell(0, 0);
    };
    vm.distances = vm.start.distances();
    let d = vm.distances.max();
    vm.start = d.cell;
    vm.distances = vm.start.distances();
    d = vm.distances.max();
    vm.end = d.cell;
    vm.active = vm.start;
    vm.visited.push(vm.start);
  }

  findDeadends() {
    let vm = this;
    let r = new List();
    vm.eachCell((c) => {
      if (c.links.items.length === 1) {
        r.push(c);
      }
    });
    return r;
  }

  solve() {
    let vm = this;
    vm.solution = vm.distances.pathTo(vm.end);
  }

  move(direction) {
    let vm = this;
    let d = direction.toLowerCase();
    let c = vm.active;

    if (!c) {
      return false;
    }

    if (!c.links.linked(c[d])) {
      return false;
    }

    vm.active = c[d];
    vm.raiseEvent('moved', d, c, vm.active, vm);
    if (vm.active === vm.end) {
      vm.raiseEvent('solved', vm);
    }

    return true;
  }

  braid(p = 0.3) {
    let vm = this;
    vm.deadends = vm.findDeadends();
    for (let i = 0; i < vm.deadends.length; i++) {
      let cell = vm.deadends[i];
      let r = Math.random();
      if (cell.links.items.length === 1 && r < p) {
        let neighbor = cell.neighbors.deadends().sample();
        if (!neighbor) {
          neighbor = cell.neighbors.notLinkedTo().sample();

        }
        cell.links.connect(neighbor, true, true);
      }
    }
    vm.deadends = vm.findDeadends();
  }

  clearWalls() {
    let vm = this;
    vm.eachCell((c) => {
      c.neighbors.items.forEach((n) => {
        c.links.connect(n, true, false);
      });
    });
  }
}

```
## cell\cell.js

**Path:** `mazes\cell\cell.js`

```

import { List } from '../../core/list.js';
import { Links } from './links.js';
import { Neighbors } from './neighbors.js';
import { Distance } from '../distance.js';
import { EventHandler } from '../../core/eventHandler.js';


export class Cell extends EventHandler {
  
  links = new Links(this);
  neighbors = new Neighbors(this);
  row = 0;
  column = 0;
  
  saveState() {
    let vm = this;
    return {
      row: vm.row,
      column: vm.column,
      links: vm.links.saveState(),
      neighbors: vm.neighbors.saveState()
    };
  }
  
  loadState(maze, state) {
    let vm = this;
    vm.links.loadState(maze, state.links);
    vm.neighbors.loadState(maze, state.neighbors);
  }
  
  constructor(row, column) {
    super();
    let vm = this;
    
    vm.row = row;
    vm.column = column;
  }
  
  get key() {
    let vm = this;
    return vm.row + ',' + vm.column;
  }
  
  get gridPosition() {
    let vm = this;
    return {
      row: vm.row,
      column: vm.column
    };
  }
  
  distances() {
    let vm = this;
    let result = new Distance(vm);
    let frontier = new List();
    frontier.push(vm);

    while (true) {
      let newFrontier = new List();

      for (let i = 0; i < frontier.length; i++) {
        let cell = frontier[i];
        for (let j = 0; j < cell.links.items.length; j++) {
          let linked = cell.links.items[j];
          let d = result.distance(cell) + 1;
          if (result.items.includes(linked)) {
            continue;
          }
          result.collect(linked, d);
          newFrontier.push(linked);
        }
      }

      if (newFrontier.length < 1) {
        break;
      }

      frontier = newFrontier;
    }

    return result;
  }
  
}

```
## cell\links.js

**Path:** `mazes\cell\links.js`

```
import { List } from '../../core/list.js';
import { EventHandler } from '../../core/eventHandler.js';

export class Links extends EventHandler {

  items = new List();
  cell;

  saveState() {
    let vm = this;
    let r = {
      row: vm.cell.row,
      column: vm.cell.column,
      items: new List()
    };

    for (let i = 0; i < vm.items.length; i++) {
      r.items.push({
        row: vm.items[i].row,
        column: vm.items[i].column
      });
    }

    return r;
  }

  loadState(maze, state) {
    let vm = this;
    vm.cell = maze.cell(state.row, state.column);
    for (let i = 0; i < state.items.length; i++) {
      vm.items.push(maze.cell(
        state.items[i].row,
        state.items[i].column
      ));
    }
  }

  constructor(cell) {
    super();
    let vm = this;

    vm.cell = cell;
  }

  connect(cell, link = true, both = true) {
    let vm = this;

    if (!cell) {
      return false;
    }

    if (link) {
      if (!vm.linked(cell)) {
        vm.items.push(cell);
      }
    } else {
      vm.items.delete(cell);
    }

    if (both) {
      cell.links.connect(vm.cell, link, false);
    }

    return true;
  }

  linked(cell) {
    let vm = this;
    if (cell === undefined) {
      return false;
    }
    return vm.items.includes(cell);
  }

  empty() {
    let vm = this;
    return vm.items.length === 0;
  }

  any() {
    let vm = this;
    return vm.items.length > 0;
  }
}

```
## cell\neighbors.js

**Path:** `mazes\cell\neighbors.js`

```
import { List } from '../../core/list.js';
import { EventHandler } from '../../core/eventHandler.js';

export class Neighbors extends EventHandler {

  items = new List();
  cell;

  saveState() {
    let vm = this;
    let r = {
      row: vm.cell.row,
      column: vm.cell.column,
      items: new List()
    };

    for (let i = 0; i < vm.items.length; i++) {
      r.items.push({
        row: vm.items[i].row,
        column: vm.items[i].column
      });
    }

    return r;
  }

  loadState(maze, state) {
    let vm = this;
    vm.cell = maze.cell(state.row, state.column);
    for (let i = 0; i < state.items.length; i++) {
      vm.items.push(maze.cell(
        state.items[i].row,
        state.items[i].column
      ));
    }
  }

  constructor(cell) {
    super();
    let vm = this;

    vm.cell = cell;
  }

  empty() {
    let vm = this;
    return vm.items.length === 0;
  }

  any() {
    let vm = this;
    return vm.items.length > 0;
  }

  unlinked() {
    let vm = this;
    let result = new List();
    for (let i = 0; i < vm.items.length; i++) {
      if (vm.items[i].links.empty()) {
        result.push(vm.items[i]);
      }
    }
    return result;
  }

  linked() {
    let vm = this;
    let result = new List();
    for (let i = 0; i < vm.items.length; i++) {
      if (vm.items[i].links.any()) {
        result.push(vm.items[i]);
      }
    }
    return result;
  }

  linkedTo(cell) {
    let vm = this;
    if (!cell) {
      cell = vm.cell;
    }

    let result = new List();
    for (let i = 0; i < vm.items.length; i++) {
      if (vm.items[i].links.items.includes(cell)) {
        result.push(vm.items[i]);
      }
    }
    return result;
  }

  notLinkedTo(cell) {
    let vm = this;
    if (!cell) {
      cell = vm.cell;
    }

    let result = new List();
    for (let i = 0; i < vm.items.length; i++) {
      if (!vm.items[i].links.items.includes(cell)) {
        result.push(vm.items[i]);
      }
    }
    return result;
  }

  deadends() {
    let vm = this;
    let result = new List();
    for (let i = 0; i < vm.items.length; i++) {
      if (vm.items[i].links.items.length === 1) {
        result.push(vm.items[i]);
      }
    }
    return result;
  }
}

```
## cell\squareCell.js

**Path:** `mazes\cell\squareCell.js`

```

import { List } from '../../core/list.js';
import { Cell } from './cell.js';

export class SquareCell extends Cell {
  north;
  east;
  south;
  west;
  
  constructor(row, column) {
    super(row, column);
  }
  
  directionOf(cell) {
    let vm = this;
    if (vm.north && vm.north.key === cell.key) {
      return 'north';
    }
    
    if (vm.east && vm.east.key === cell.key) {
      return 'east';
    }
    
    if (vm.south && vm.south.key === cell.key) {
      return 'south';
    }
    
    if(vm.west && vm.west.key === cell.key) {
      return 'west';
    }
  }
  
}

```
## generators\aldousBroder.js

**Path:** `mazes\generators\aldousBroder.js`

```
import { List } from '../../core/list.js';
import { Generator } from './generator.js';

export class AldousBroder extends Generator {

  generate() {
    let vm = this;
    vm.maze.initialize();
    
    let cell = vm.maze.randomCell();
    let unvisited = vm.maze.cells.length - 1;
    
    while(unvisited > 0) {
      let neighbor = cell.neighbors.items.sample();
      if(neighbor.links.empty()) {
        cell.links.connect(neighbor, true, true);
        unvisited--;
      }
      cell = neighbor;
    }
    
    vm.maze.setup();
    
    vm.raiseEvent('generated');

  }

}

```
## generators\binaryTree.js

**Path:** `mazes\generators\binaryTree.js`

```
import { List } from '../../core/list.js';
import { Generator } from './generator.js';

export class BinaryTree extends Generator {

  generate() {
    let vm = this;
    vm.maze.initialize();
    
    vm.maze.walkGrid((r, c) => {
      let cell = vm.maze.cell(r, c);
      let choice = new List();

      let north = vm.maze.cell(cell.row - 1, cell.column);
      if (north) {
        choice.push(north);
      }

      let east = vm.maze.cell(cell.row, cell.column + 1)
      if (east) {
        choice.push(east);
      }

      if (choice.length > 0) {
        cell.links.connect(
          choice.sample(),
          true,
          true);
      }
    });
    
    vm.maze.setup();
    
    vm.raiseEvent('generated');

  }

}

```
## generators\generator.js

**Path:** `mazes\generators\generator.js`

```
import { EventHandler } from '../../core/eventHandler.js';

export class Generator extends EventHandler {

  maze;
  name = '';
  summary = ``;

  constructor(maze) {
    super();
    let vm = this;
    
    vm.defineEvent('generated');
    vm.maze = maze;
  }

  generate() {
    let vm = this;
    vm.raiseEvent('generated');
  }

}


/*****   template   ***********************************

import { List } from '../../core/list.js';
import { Generator } from './generator.js';

export class Template extends Generator {

  generate() {
    vm.maze.initialize();
    
    
    
    vm.maze.setup();
    
    vm.raiseEvent('generated');

  }

}

****************/

```
## generators\growingTree.js

**Path:** `mazes\generators\growingTree.js`

```

import { List } from '../../core/list.js';
import { Generator } from './generator.js';

export class GrowingTree extends Generator {
  
  static sample(list) {
    return list.sample();
  }
  
  static first(list) {
    return list[0];
  }
  
  static last(list) {
    return list[list.length - 1];
  }
  
  static median(list) {
    return list[Math.floor(list.length/2)];
  }
  
  static #filters = [
    GrowingTree.sample,
    GrowingTree.first,
    GrowingTree.last,
    GrowingTree.median,
    GrowingTree.PRB
    ];
    
  static random(list) {
    let filters = GrowingTree.#filters;
    let idx = Math.floor(Math.random() * filters.length);
    return filters[idx](list);
  }
  
  static PRB(list) {
    return Math.floor(Math.random() * 2) === 0 ? list.sample() : list[list.length - 1];
  }

  generate(filter = GrowingTree.last) {
    let vm = this;
    vm.maze.initialize();
    
    let startAt = vm.maze.randomCell();
    let active = new List();
    active.push(startAt);
    
    while(active.any()) {
      let cell = filter(active);
      let availableNeighbors = cell.neighbors.unlinked();
      if(availableNeighbors.any()) {
        let neighbor = availableNeighbors.sample();
        cell.links.connect(neighbor, true, true);
        active.push(neighbor);
      } else {
        active.delete(cell);
      }
    }
    
    vm.maze.setup();
    
    vm.raiseEvent('generated');

  }

}


```
## generators\huntAndKill.js

**Path:** `mazes\generators\huntAndKill.js`

```

import { List } from '../../core/list.js';
import { Generator } from './generator.js';

export class HuntAndKill extends Generator {

  generate() {
    let vm = this;
    vm.maze.initialize();
    
    let current = vm.maze.randomCell();
    
    while(current) {
      let unvisitedNeighbors = current.neighbors.unlinked();
      if(unvisitedNeighbors.any()) {
        let neighbor = unvisitedNeighbors.sample();
        current.links.connect(neighbor, true, true);
        current = neighbor;
      } else {
        current = undefined;
        for(let i = 0; i < vm.maze.cells.length; i++) {
          let cell = vm.maze.cells[i];
          let visitedNeighbors = cell.neighbors.linked();
          if(cell.links.empty() && visitedNeighbors.any()) {
            current = cell;
            let neighbor = visitedNeighbors.sample();
            current.links.connect(neighbor, true, true);
            break;
          }
        }
      }
    }
    
    vm.maze.setup();
    
    vm.raiseEvent('generated');

  }

}

```
## generators\prims.js

**Path:** `mazes\generators\prims.js`

```

import { List } from '../../core/list.js';
import { Generator } from './generator.js';

export class SimplePrims extends Generator {

  generate() {
    let vm = this;
    vm.maze.initialize();
    
    let startAt = vm.maze.randomCell();
    let active = new List();
    active.push(startAt);
    
    while(active.any()) {
      let cell = active.sample();
      let availableNeighbors = cell.neighbors.unlinked();
      if(availableNeighbors.any()) {
        let neighbor = availableNeighbors.sample();
        cell.links.connect(neighbor, true, true);
        active.push(neighbor);
      } else {
        active.delete(cell);
      }
    }
    
    vm.maze.setup();
    
    vm.raiseEvent('generated');

  }

}


```
## generators\recursiveBacktracker.js

**Path:** `mazes\generators\recursiveBacktracker.js`

```

import { List } from '../../core/list.js';
import { Generator } from './generator.js';

export class RecursiveBacktracker extends Generator {

  generate() {
    let vm = this;
    vm.maze.initialize();
    
    let stack = new List();
    stack.push(vm.maze.randomCell());
    
    while(stack.length > 0) {
      let current = stack[stack.length - 1];
      let neighbors = current.neighbors.unlinked();
      if(neighbors.length === 0) {
        stack.pop();
      } else {
        let neighbor = neighbors.sample();
        current.links.connect(neighbor, true, true);
        stack.push(neighbor);
      }
    }

    vm.maze.setup();
    
    vm.raiseEvent('generated');

  }

}

```
## generators\sidewinder.js

**Path:** `mazes\generators\sidewinder.js`

```
import { List } from '../../core/list.js';
import { Generator } from './generator.js';

export class Sidewinder extends Generator {

  generate() {
    let vm = this;
    vm.maze.initialize();

    let run;
    vm.maze.walkGrid((r, c) => {
      if (c === 0) {
        run = new List();
      }

      let cell = vm.maze.cell(r, c);
      let north = vm.maze.cell(cell.row - 1, cell.column);
      let east = vm.maze.cell(cell.row, cell.column + 1)

      run.push(cell);

      let zeroOut = Math.floor(Math.random() * 2) === 0;
      let closeRun = !east || (north && zeroOut);
      if (closeRun) {
        let n = run.sample();
        north = vm.maze.cell(n.row - 1, n.column);
        n.links.connect(north, true, true);
        run = new List();
      } else {
        cell.links.connect(east, true, true);
      }

    });

    vm.maze.setup();

    vm.raiseEvent('generated');

  }

}

```
## generators\wilsons.js

**Path:** `mazes\generators\wilsons.js`

```
import { List } from '../../core/list.js';
import { Generator } from './generator.js';

export class Wilsons extends Generator {

  generate() {
    let vm = this;
    vm.maze.initialize();
    let first = vm.maze.cells.sample();
    let unvisited = new List();

    vm.maze.eachCell((c) => {
      if (c !== first) {
        unvisited.push(c);
      }
    });

    while (unvisited.any()) {
      let cell = unvisited.sample();
      let path = new List();

      path.push(cell);
      while (unvisited.includes(cell)) {
        cell = cell.neighbors.items.sample();
        let index = path.indexOf(cell);
        if (index >= 0) {
          path.length = index + 1;
        } else {
          path.push(cell);
        }
      }

      for (let i = 0; i < path.length - 1; i++) {
        path[i].links.connect(path[i + 1], true, true);
        unvisited.delete(path[i]);
      }
    }

    vm.maze.setup();

    vm.raiseEvent('generated');

  }

}

```
## renderers\canvasRectangle.js

**Path:** `mazes\renderers\canvasRectangle.js`

```
import { Line, Rectangle } from './common.js';
import { EventHandler } from '../../core/eventHandler.js';

export class CanvasRectangle extends EventHandler {

  #maze;
  #scaler;
  #gfx;

  bgColor = 'black';
  wallColor = 'orange';
  floorColor = 'black';
  startColor = 'cornflowerblue';
  endColor = 'green'; //'#D2042D';
  //pathColor = '#7F00FF';
  activeColor = 'silver'; //'#800080';
  solveColor = 'teal';

  showSolution = false;
  showHistogram = false;

  constructor(game, maze, scaler, gfx) {
    super();
    let vm = this;

    vm.defineEvent('rendered');
    vm.#maze = maze;
    vm.#scaler = scaler;
    vm.#gfx = gfx;

    maze.listenToEvent('moved', (dir, from, to, $maze) => {
      vm.drawMove(from, $maze);
    });
    
    game.listenToEvent('teleported', (from, to, $maze) => {
      vm.drawMove(from, $maze);
    });
  }
  
  drawMove(from, $maze){
    let vm = this;
    vm.eraseFloor(from.row, from.column);
    vm.drawSolutionFloor(from.row, from.column);
    
    if (from === $maze.start) {
      vm.drawStart();
    }
    
    if (from === $maze.end) {
      vm.drawEnd();
    }
    
    vm.drawActive();
  }

  scaleLock(n, min = 0) {
    let vm = this;
    if (vm.#scaler.size > 22) {
      return n;
    }
    return min;
  }

  #drawCircle(cell, color, offsetFactor = 0.75, fill = true) {
    let vm = this;
    if (offsetFactor >= 1) {
      offsetFactor = 0.9;
    }

    let x = vm.#scaler.x(cell.column);
    let y = vm.#scaler.y(cell.row);
    let r = Math.floor(vm.#scaler.size / 2);
    let offset = Math.floor(r - (r * offsetFactor));

    if (fill) {
      vm.#gfx.fillStyle = color;
    } else {
      vm.#gfx.strokeStyle = color;
    }

    vm.#gfx.beginPath();
    vm.#gfx.ellipse(
      x + r,
      y + r,
      r - vm.scaleLock(offset, 1.5),
      r - vm.scaleLock(offset, 1.5),
      0,
      0,
      360);
    if (fill) {
      vm.#gfx.fill();
    } else {
      vm.#gfx.stroke();
    }
    vm.#gfx.closePath();
  }

  #drawRectangle(cell, color, offsetFactor = 0.75) {
    let vm = this;
    let offset = Math.floor(vm.#scaler.size - (vm.#scaler.size * offsetFactor));
    new Rectangle(
        vm.#scaler.x(cell.column) + vm.scaleLock(offset, 1.5),
        vm.#scaler.y(cell.row) + vm.scaleLock(offset, 1.5),
        vm.#scaler.size - vm.scaleLock(offset * 2, 3),
        vm.#scaler.size - vm.scaleLock(offset * 2, 3),
        color,
        vm.#gfx)
      .fill();
  }

  #drawNorthEdge(r, c, color) {
    let vm = this;
    let x = vm.#scaler.x(c);
    let y = vm.#scaler.y(r);
    let scale = vm.#scaler.size;

    new Line(
        x,
        y,
        x + scale,
        y,
        vm.#gfx)
      .draw(color);
  }

  #drawEastEdge(r, c, color) {
    let vm = this;
    let x = vm.#scaler.x(c);
    let y = vm.#scaler.y(r);
    let scale = vm.#scaler.size;

    new Line(
        x + scale,
        y, x + scale,
        y + scale,
        vm.#gfx)
      .draw(color);
  }

  #drawSouthEdge(r, c, color) {
    let vm = this;
    let x = vm.#scaler.x(c);
    let y = vm.#scaler.y(r);
    let scale = vm.#scaler.size;

    new Line(
        x,
        y + scale,
        x + scale,
        y + scale,
        vm.#gfx)
      .draw(color);
  }

  #drawWestEdge(r, c, color) {
    let vm = this;
    let x = vm.#scaler.x(c);
    let y = vm.#scaler.y(r);
    let scale = vm.#scaler.size;

    new Line(
        x,
        y,
        x,
        y + scale,
        vm.#gfx)
      .draw(vm.wallColor);
  }

  fillBg() {
    let vm = this;
    new Rectangle(
        0,
        0,
        vm.#scaler.stageWidth,
        vm.#scaler.stageHeight,
        vm.#gfx)
      .fill(vm.bgColor);
  }

  normalize(value, min, max) {
    let normalized = (value - min) / (max - min);
    return normalized;
  }

  draw() {
    let vm = this;
    vm.fillBg();

    vm.#maze.walkGrid((r, c) => {
      vm.drawFloor(r, c);
    });

    vm.drawSolution();
    vm.drawStart();
    vm.drawEnd();
    vm.drawActive();

    vm.#maze.walkGrid((r, c) => {
      vm.drawWalls(r, c);
    });

    vm.drawBorder();

    vm.raiseEvent('rendered');
  }

  drawBorder() {
    let vm = this;
    new Rectangle(
        vm.#scaler.x(0),
        vm.#scaler.y(0),
        vm.#scaler.width,
        vm.#scaler.height,
        vm.#gfx)
      .stroke(vm.wallColor);
  }

  revealSolution() {
    let vm = this;
    vm.showSolution = true;
    vm.#maze.solve();
    vm.drawSolution();
    vm.drawStart();
    vm.drawEnd();
    vm.drawActive();
  }


  hideSolution() {
    let vm = this;
    vm.drawSolution(vm.floorColor, false);
    vm.drawStart();
    vm.drawEnd();
    vm.drawActive();
    vm.showSolution = false;
  }

  drawSolution(color, show = true) {
    let vm = this;
    if (!vm.showSolution || !vm.#maze.solution) {
      return;
    }

    if (!color) {
      color = vm.solveColor;
    }

    for (let i = 0; i < vm.#maze.solution.items.length; i++) {
      if (show) {
        vm.drawSolutionFloor(
          vm.#maze.solution.items[i].row,
          vm.#maze.solution.items[i].column,
          color);
      } else {
        vm.eraseFloor(
          vm.#maze.solution.items[i].row,
          vm.#maze.solution.items[i].column);
      }
    }
  }

  drawSolutionFloor(r, c, color) {
    let vm = this;
    if (!vm.showSolution || !vm.#maze.solution || !vm.#maze.solution.items.includes(vm.#maze.cell(r, c))) {
      return;
    }

    if (!color) {
      color = vm.solveColor;
    }
    let cell = vm.#maze.cell(r, c);
    vm.#drawCircle(cell, color, 0.3);
  }

  eraseFloor(r, c) {
    let vm = this;
    let color = vm.floorColor;
    let floor = new Rectangle(
      vm.#scaler.x(c) + 1,
      vm.#scaler.y(r) + 1,
      vm.#scaler.size - 2,
      vm.#scaler.size - 2,
      vm.#gfx);
    if (vm.showHistogram) {
      let cell = vm.#maze.cell(r, c);
      let a = vm.normalize(
        vm.#maze.distances.distance(cell),
        vm.#maze.distances.distance(vm.#maze.end),
        0
      );
      color = vm.histogramColor(a);
      floor.fill(vm.floorColor);
    }

    floor.fill(color);
  }


  drawFloorEdges(r, c) {
    let vm = this;
    let cell = vm.#maze.cell(r, c);
    let color = vm.floorColor;
    let draw = (color) => {
      if (!cell) {
        return;
      }
      if (cell.links.linked(cell.north)) {
        vm.#drawNorthEdge(r, c, color);
      }
      if (cell.links.linked(cell.east)) {
        vm.#drawEastEdge(r, c, color);
      }
      if (cell.links.linked(cell.south)) {
        vm.#drawSouthEdge(r, c, color);
      }
      if (cell.links.linked(cell.west)) {
        vm.#drawWestEdge(r, c, color);
      }
    };
    if (vm.showHistogram) {
      let a = vm.normalize(
        vm.#maze.distances.distance(cell),
        vm.#maze.distances.distance(vm.#maze.end),
        0
      );
      color = vm.histogramColor(a);
      draw(vm.floorColor);
    }
    draw(color);
  }

  drawFloor(r, c) {
    let vm = this;
    let color = vm.floorColor;
    let floor = new Rectangle(
      vm.#scaler.x(c),
      vm.#scaler.y(r),
      vm.#scaler.size,
      vm.#scaler.size,
      vm.#gfx);
    if (vm.showHistogram) {
      let cell = vm.#maze.cell(r, c);
      let a = vm.normalize(
        vm.#maze.distances.distance(cell),
        vm.#maze.distances.distance(vm.#maze.end),
        0
      );
      color = vm.histogramColor(a);
      floor.fill(vm.floorColor);
    }
    floor.fill(color);
  }

  drawWalls(r, c) {
    let vm = this;
    let cell = vm.#maze.cell(r, c);
    if (!cell) {
      return;
    }
    if (!cell.links.linked(cell.north)) {
      vm.#drawNorthEdge(r, c, vm.wallColor);
    }
    if (!cell.links.linked(cell.east)) {
      vm.#drawEastEdge(r, c, vm.wallColor);
    }
    if (!cell.links.linked(cell.south)) {
      vm.#drawSouthEdge(r, c, vm.wallColor);
    }
    if (!cell.links.linked(cell.west)) {
      vm.#drawWestEdge(r, c, vm.wallColor);
    }
  }

  drawStart() {
    let vm = this;
    if (!vm.#maze.start) {
      vm.#maze.start = vm.#maze.cell(0, 0);
    }
    let cell = vm.#maze.start;
    vm.#drawCircle(cell, vm.startColor);
  }

  drawEnd() {
    let vm = this;
    if (!vm.#maze.end) {
      vm.#maze.end = vm.#maze.cell(vm.#maze.rows - 1, vm.#maze.columns - 1);
    }
    let cell = vm.#maze.end;
    vm.#drawCircle(cell, vm.endColor);
  }

  drawActive() {
    let vm = this;
    if (!vm.#maze.active) {
      vm.#maze.active = vm.#maze.cell(0, 0);
    }
    let cell = vm.#maze.active;
    vm.#drawCircle(cell, vm.activeColor);
  }

  histogram() {
    let vm = this;
    vm.showHistogram = !vm.showHistogram;
    vm.draw();
  }

  histogramColor(a) {
    return `rgba(112,41,99,${a})`;
  }

}

```
## renderers\canvasRectangleScaler.js

**Path:** `mazes\renderers\canvasRectangleScaler.js`

```
import { EventHandler } from '../../core/eventHandler.js';

export class CanvasRectangleScaler extends EventHandler {

  #maxCells = 5000;
  #size = 24;
  stageWidth = 300;
  stageHeight = 300;

  rows;
  columns;
  width;
  height;
  offsetX;
  offsetY;
  cells;
  size;

  constructor(width, height, rooms = 3000, toTiny = 14) {
    super();
    let vm = this;
    
    vm.stageWidth = width;
    vm.stageHeight = height;
    vm.#maxCells = rooms;
    vm.#size = toTiny;
    vm.calc();
  }

  setScaleBounds(maxCells, minSize) {
    let vm = this;
    vm.#maxCells = maxCells;
    vm.#size = minSize;
  }

  calc() {
    let vm = this;
    let scale = vm.#scale();
    vm.columns = Math.floor(vm.stageWidth / scale);
    vm.width = vm.columns * scale;
    vm.rows = Math.floor(vm.stageHeight / scale);
    vm.height = vm.rows * scale;
    vm.cells = vm.rows * vm.columns;
    vm.offsetX = Math.floor((vm.stageWidth - vm.width) / 4);
    vm.offsetY = Math.floor((vm.stageHeight - vm.height) / 4);
    vm.size = scale;
  }

  #scale() {
    let vm = this;
    let n = vm.#maxCells;
    let w = vm.stageWidth;
    let h = vm.stageHeight;
    let sw, sh;

    let pw = Math.ceil(Math.sqrt(n * w / h));
    if (Math.floor(pw * h / w) * pw < n) {
      sw = h / Math.ceil(pw * h / w);
    } else {
      sw = w / pw;
    }

    let ph = Math.ceil(Math.sqrt(n * h / w));
    if (Math.floor(ph * w / h) * ph < n) {
      sh = w / Math.ceil(w * ph / h);
    } else {
      sh = h / ph;
    }

    let v = Math.floor(Math.max(sw, sh));
    if (v < vm.#size) {
      v = vm.#size;
    }

    return v;
  }

  y(r) {
    let vm = this;
    return r * vm.size + vm.offsetY;
  }

  x(c) {
    let vm = this;
    return c * vm.size + vm.offsetX;
  }
}

```
## renderers\common.js

**Path:** `mazes\renderers\common.js`

```
export class Line {
  x1 = 0;
  y1 = 0;
  x2 = 0;
  y2 = 0;
  #gfx = undefined;

  constructor(x1, y1, x2, y2, gfx) {
    let vm = this;
    vm.x1 = x1;
    vm.y1 = y1;
    vm.x2 = x2;
    vm.y2 = y2;
    vm.#gfx = gfx;
  }

  draw(style) {
    let vm = this;
    let exec = () => {
      vm.#gfx.beginPath();
      vm.#gfx.moveTo(vm.x1, vm.y1);
      vm.#gfx.lineTo(vm.x2, vm.y2);
      vm.#gfx.strokeStyle = style;
      vm.#gfx.stroke();
      vm.#gfx.closePath();
    };

    exec();
  }
}

export class Rectangle {
  x = 0;
  y = 0;
  width = 0;
  height = 0;
  #gfx = undefined;


  constructor(x, y, width, height, gfx) {
    let vm = this;
    vm.x = x;
    vm.y = y;
    vm.width = width;
    vm.height = height;
    vm.#gfx = gfx;
  }

  fill(style) {
    let vm = this;
    vm.#gfx.fillStyle = style;
    vm.#gfx.beginPath();
    vm.#gfx.rect(
      vm.x,
      vm.y,
      vm.width,
      vm.height);
    vm.#gfx.fill();
    vm.#gfx.closePath();
  }
  
  stroke(style) {
    let vm = this;
    vm.#gfx.strokeStyle = style;
    vm.#gfx.beginPath();
    vm.#gfx.rect(
      vm.x,
      vm.y,
      vm.width,
      vm.height);
    vm.#gfx.stroke();
    vm.#gfx.closePath();
  }
}

```
## renderers\mazeToText.js

**Path:** `mazes\renderers\mazeToText.js`

```
import { EventHandler } from '../../core/eventHandler.js';

export class MazeToText extends EventHandler {
  #maze;
  #output;
  
  constructor(maze) {
    super();
    let vm = this;
    
    vm.#maze = maze;
  }
  
  render(){
    let vm = this;
    vm.#output = '+';
    for(let y = 0; y < vm.#maze.columns; y++) {
      vm.#output += '---+';
    }
    vm.#output += '\r\n';
    
    let top = '';
    let bottom = '';
    let eastBoundry = '';
    let southBoundry = '';
    vm.#maze.walkGrid((r, c) => {
      if(c === 0) {
        top = '|';
        bottom = '+';
      }
      
      let cell = vm.#maze.cell(r, c);
      
      eastBoundry = (cell.links.linked(cell.east)) ? ' ' : '|';
      top += '   ' + eastBoundry;
      
      southBoundry = (cell.links.linked(cell.south)) ? '   ' : '---';
      bottom += southBoundry + '+';
      
      if(c === vm.#maze.columns - 1) {
        vm.#output += top + '\r\n';
        vm.#output += bottom + '\r\n';
      }
    });
  }
  
  get text() {
    let vm = this;
    vm.render();
    return vm.#output;
  }
  
}

```
