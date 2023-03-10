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
