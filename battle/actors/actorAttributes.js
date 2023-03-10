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
