import { List } from '../../core/list.js';
import { EventHandler } from '../../core/eventHandler.js'
import { ActorSkill } from './actorSkill.js';
import { ActorLevel } from './actorLevel.js';
import { ActorAttributes } from './actorAttributes.js';
import { ActorInventory } from './actorInventory.js';
import { Attack } from './skills/attack.js';
import { GCD } from './skills/gcd.js';

export class Actor extends EventHandler {

  name = 'base actor';
  attributes;
  level;
  inventory;
  skills = {};
  target;
  enemies = new List();
  casting;
  gameLevel;

  constructor(gameLevel) {
    super();
    let vm = this;

    vm.gameLevel = gameLevel;

    vm.level = new ActorLevel(vm);
    vm.attributes = new ActorAttributes(vm);
    vm.inventory = new ActorInventory(vm);

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
      'end gcd'
    );

    vm.addSkill('GCD', new GCD(vm));
    vm.addSkill('attack', new Attack(vm));

    vm.raiseEvent('actor constructed', vm);
  }
  
  spendMp(amt) {
    let vm = this;
    if(amt <= vm.attributes.mp) {
      vm.attributes.mp -= amt;
      return true
    }
    
    return false;
  }

  heal(amt) {
    let vm = this;
    let hp = vm.attributes.hp + amt;
    let over = 0;
    if(vm.attributes.maxHp < hp) {
      over = hp - vm.attributes.maxHp;
      vm.attributes.hp += (amt - over);
    } else {
      vm.attributes.hp += amt;
    }
    vm.raiseEvent('healed', vm, amt, over);
  }
  
  takeDamage(dmg) {
    let vm = this;
    vm.attributes.hp -= dmg;
    vm.raiseEvent('damaged', vm, dmg);
    if (vm.attributes.hp < 1) {
      vm.raiseEvent(
        'death',
        {
          actor: vm,
          gameLevel: vm.gameLevel
        });
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
    return hostile ? this.enemies.sample() : vm;
  }
  
  recover() {
    let vm = this;
    vm.hp = vm.maxHp;
    vm.mp = vm.maxMp;
  }

}