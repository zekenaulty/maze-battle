import { go } from './isReady.js';
import { List } from './core/list.js';
import { Header } from './layout/header/header.js';
import { Stage } from './layout/stage/stage.js';
import { JoyStick } from './layout/joystick/joystick.js';
import { Maze } from './mazes/maze.js';
import { CanvasRectangle } from './mazes/renderers/canvasRectangle.js';
import { CanvasRectangleScaler } from './mazes/renderers/canvasRectangleScaler.js';
import { MazeToText } from './mazes/renderers/mazeToText.js';
import { BinaryTree } from './mazes/generators/binaryTree.js';

import { EventHandler } from './core/eventHandler.js';

(() => {

  go(() => {

    let scaler;
    let maze;
    let renderer;
    let generatorIndex = 0;
    const generators = new List();
    const header = new Header();
    const stage = new Stage((gfx) => {
      
      scaler = new CanvasRectangleScaler(stage.width, stage.height);
      maze = new Maze(scaler.rows, scaler.columns);
      renderer = new CanvasRectangle(maze, scaler, stage.gfx);
      
      generators.push(new BinaryTree(maze));

      generators.forEach((g) => {
        g.listenToEvent('generated', () => {
          renderer.draw();
        });
      });
      
      generate();

    });
    const joystick = new JoyStick();

    const generate = () => {
      generators[generatorIndex].generate();
    };

    header.addButton('SAVE', (e) => {});
    header.addButton('NEW GAME', (e) => { 
      generate(); 
    });
    header.addButton('SOLVE (1000g)', (e) => {});
    header.addButton('CHARACTER', (e) => {});

    joystick.listenToEvent('up', () => {
      maze.move('north');
    });
    
    joystick.listenToEvent('down',  () => {
      maze.move('south');
    });
    
    joystick.listenToEvent('left', () => {
      maze.move('west');
    });
    
    joystick.listenToEvent('right',  () => {
      maze.move('east');
    });

  });

})();
