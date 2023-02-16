import { List } from '../../../core/list.js';
import { Actor } from '../actor.js';
import { ActorSkill } from '../actorSkill.js';
import { ActorLevel } from '../actorLevel.js';
import { ActorInventory } from '../actorInventory.js';
import { ActorAttributes } from '../actorAttributes.js';
import { Modal } from '../../../ui/modal/modal.js';
import { MagicMissles } from '../skills/magicMissles.js';
import { Wand } from '../skills/wand.js';
import { Dice } from '../../dice.js';

export class Mage extends Actor {

  #aiIntervalMin = 777;
  #aiIntervalMax = 1331;

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
    vm.addSkill('magicMissles', new MagicMissles(vm));


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

    vm.attributes.baseHp = 120;
    vm.attributes.baseMp = 400;
    vm.attributes.scaleWith = 'intellect';

    vm.attributes.baseDamage = 7;
    vm.attributes.strength = 10;
    vm.attributes.vitality = 15;
    vm.attributes.intellect = 80;
    vm.attributes.pointsPerLevel = 5;

    vm.attributes.hp = vm.attributes.maxHp;
    vm.attributes.mp = vm.attributes.maxMp;
  }

  aiLoop() {
    let vm = this;

    if (!vm.aiCanAct()) {
      return;
    }

    if (
      vm.skills.magicMissles &&
      vm.enemies.length > 1 &&
      !vm.skills.magicMissles.onCd &&
      vm.attributes.mp >= vm.skills.magicMissles.mpCost &&
      Dice.d6() > 3
    ) {
      vm.skills.magicMissles.invoke();
      return;
    } else if (vm.skills.wand && !vm.skills.wand.onCd) {
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
    vm.buyAttribute('intellect');

  }

}
