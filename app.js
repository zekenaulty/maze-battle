import { go } from './isReady.js';
import { List } from './core/list.js';
import { Header } from './layout/header/header.js';
import { Stage } from './layout/stage/stage.js';
import { JoyStick } from './layout/joystick/joystick.js';
import { Modal } from './layout/modal/modal.js';
import { GameLevel } from './battle/gameLevel.js';
import { Loader } from './layout/loader/loader.js';
import { Saves } from './battle/ui/saves.js';
import { Characters } from './battle/actors/ui/characters.js'
(() => {

  go(() => {

    Loader.open();

    /* 
      used for dirty history hax 
      to allow back button to 
      close modals... 
      dev on android phone relflex
      back button
    */
    history.replaceState(0, 'root');

    const game = new GameLevel();
    const saves = new Saves(game);

    game.listenToEvent('updated', () => {
      header.info(game.summary);
    });

    const stageReady = (gfx) => {
      game.initialize(
        stage.width,
        stage.height,
        gfx);
      game.begin();
    };

    const header = new Header(game);
    const stage = new Stage(stageReady);
    const joystick = new JoyStick(game);

    const player = header.addButton('AUTO PLAY', (e) => {
      if (game.autoPilot.running) {
        game.autoPilot.stop();
        player.innerHTML = 'AUTO PLAY';
      } else {
        game.fightWaves.stop();
        waves.innerHTML = 'FIGHT WAVES';
        game.autoPilot.start();
        player.innerHTML = 'MANUAL PLAY';
      }
    });

    const waves = header.addButton('FIGHT WAVES', (e) => {
      if (game.fightWaves.running) {
        game.fightWaves.stop();
        waves.innerHTML = 'FIGHT WAVES';
      } else {
        game.autoPilot.stop();
        game.fightWaves.start();
        waves.innerHTML = 'STOP WAVES';
      }
    });

    const states = header.addButton('SAVES', (e) => {
      saves.open(true);
    });

    const character = header.addButton('CHARACTERS', (e) => {
      Characters.show(game);
    });

    game.listenToEvent('grind started', () => {
      waves.innerHTML = 'STOP WAVES';
    });

    game.listenToEvent('grind stopped', () => {
      waves.innerHTML = 'FIGHT WAVES';
    });

    joystick.listenToEvent('up', () => {
      game.move('north');
    });

    joystick.listenToEvent('down', () => {
      game.move('south');
    });

    joystick.listenToEvent('left', () => {
      game.move('west');
    });

    joystick.listenToEvent('right', () => {
      game.move('east');
    });

  });

})();
