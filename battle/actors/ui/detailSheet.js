import { List } from '../../../core/list.js';
import { Modal } from '../../../ui/modal/modal.js'
import { SaveData } from '../../saveData.js';

export class DetailSheet extends Modal {

  #stylesheet;
  #actor;
  #editable = false;
  #container;
  #skills;
  #elements = new List();
  
  get container() {
    let vm = this;
    return vm.#container;
  }

  constructor(actor, editable = false) {
    super();
    let vm = this;

    vm.#actor = actor;
    vm.#editable = editable;

    if (!document.getElementById('detail-sheet-styles')) {
      vm.#stylesheet = document.createElement('link');
      vm.#stylesheet.id = 'detail-sheet-styles';
      vm.#stylesheet.rel = 'stylesheet';
      vm.#stylesheet.href = './battle/actors/ui/detailSheet.css';
      document.querySelector('head').appendChild(vm.#stylesheet);
    } else {
      vm.#stylesheet = document.querySelector('#detail-sheet-styles');
    }

    vm.#container = document.createElement('div');
    vm.#container.classList.add('detail-sheet-content');
    vm.appendChild(vm.#container);

    vm.#add('Name', vm.#actor, 'displayName');
    vm.#add('Class', vm.#actor, 'name');
    vm.#add('Level', vm.#actor.level, 'level');
    vm.#add('XP', vm.#actor.level, 'xpRequired');
    vm.#add('Gold', vm.#actor.inventory, 'gold');
    vm.#spacer();
    vm.#add('Health', vm.#actor.attributes, 'health');
    vm.#add('Mana', vm.#actor.attributes, 'mana');
    vm.#add('Damage', vm.#actor.attributes, 'damageRange');
    vm.#spacer();
    vm.#add('Available Points', vm.#actor.attributes, 'available');
    vm.#spacer();
    vm.#add('Vitality', vm.#actor.attributes, 'vitality', true && editable);
    vm.#add('Strength', vm.#actor.attributes, 'strength', true && editable);
    vm.#add('Intellect', vm.#actor.attributes, 'intellect', true && editable);
    vm.#spacer();

    let isHero = vm.#actor.gameLevel.isHero(vm.#actor);
    let txt = isHero ? 'Skills <span class="tiny-text">(☆ castable)</span>': 'Skills';
    vm.#text(txt);
    vm.#skills = document.createElement('div');
    vm.#skills.classList.add('detail-sheet-skills');
    vm.#container.appendChild(vm.#skills);
    let edge = '';
    for (let p in vm.#actor.skills) {
      let skill = vm.#actor.skills[p];
      if (skill.register) {
        vm.#addSkill(skill, isHero, edge);
        edge = 'detail-sheet-skill-edge';
      }
    }

    vm.listenToEvent('opening', (e) => {
      e.modal.update();
    });

    vm.listenToEvent('closed', (e) => {
      if(vm.#actor.gameLevel.isHero(vm.#actor)) {
        SaveData.save(vm.#actor.gameLevel);
      }
      vm.#actor.gameLevel.raiseEvent('updated', vm.#actor.gameLevel);
    });
  }

  #addSkill(skill, isHero, edge) {
    let vm = this;
    let e = {
      element: document.createElement('span'),
      update: () => {
        let castable = skill.availableOutOfCombat ? '☆ ' : '';
        let mp = skill.mpCost > 0 ? `, ${skill.mpCost}mp` : ``;
        e.element.innerHTML = `<span class="bold">${castable}${skill.name} (${skill.cooldown/1000}s cd${mp}): </span><span>${skill.summary}</span>`;
      }
    };

    if (isHero && skill.availableOutOfCombat && vm.#editable) {
      e.element.addEventListener('click', () => {
        e.element.classList.add('detail-sheet-skill-active');
        let clear = () => {
          e.element.classList.remove('detail-sheet-skill-active');
          vm.update();
          skill.ignoreEvent('end recoil', clear);
        };
        skill.listenToEvent('end recoil', clear);
        skill.invoke();
      });
    }

    e.update();
    e.element.classList.add('detail-sheet-skill');
    if(edge != '') {
      e.element.classList.add(edge);
    }
    vm.#elements.push(e);
    vm.#skills.appendChild(e.element);
  }

  #add(label, scope, key, editableAttribute = false) {
    let vm = this;
    let target = vm.#container;

    let e = {
      row: document.createElement('div'),
      infoGroup: document.createElement('span'),
      label: document.createElement('span'),
      value: document.createElement('span'),
      button: editableAttribute ? document.createElement('button') : undefined,
      update: () => {
        e.label.innerHTML = `${label}:&nbsp;`;
        if (scope[key + 'Level']) {
          e.value.innerHTML = `${scope[key] + scope[key + 'Level']}`;
        } else {
          e.value.innerHTML = `${scope[key]}`;
        }
      }
    };

    e.row.classList.add('detail-sheet-attribute-row');
    e.infoGroup.classList.add('detail-sheet-attribute-group');
    e.label.classList.add('detail-sheet-attribute-bold');
    e.value.classList.add('detail-sheet-attribute-text');

    e.infoGroup.appendChild(e.label);
    e.infoGroup.appendChild(e.value);
    e.row.appendChild(e.infoGroup);
    if (editableAttribute) {
      e.button.classList.add('detail-sheet-attribute-button');
      e.button.innerHTML = '+';
      e.row.appendChild(e.button);
      e.button.addEventListener('click', () => {
        if (vm.#actor.attributes.available > 0) {
          vm.#actor.attributes.available--;
          scope[key]++;
          vm.#actor.attributes.raiseEvent(
            'changed',
            {
              sheet: vm,
              actor: vm.#actor
            });
        }
        vm.update();
      });
    }

    vm.#elements.push(e);
    target.appendChild(e.row);

  }

  #spacer(target) {
    let vm = this;
    if (!target) {
      target = vm.#container;
    }

    let row = document.createElement('div');
    row.innerHTML = '&nbsp;';
    target.appendChild(row);
  }

  #text(t, target, bold = true) {
    let vm = this;
    if (!target) {
      target = vm.#container;
    }
    let txt = document.createElement('span');
    txt.innerHTML = t;
    txt.classList.add(bold ? 'detail-sheet-attribute-bold' : 'detail-sheet-attribute-text');
    target.appendChild(txt);
  }

  update() {
    let vm = this;
    for (let i = 0; i < vm.#elements.length; i++) {
      vm.#elements[i].update();
    }
  }
}
